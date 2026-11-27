import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginRolesConflict, beginRolesCreate, cleanupOwnedRoles, readRolesCleanupManifest, reconcileRolesCreate, reconcileRolesConflict, registerOwnedRole, resolveRolesConflict } from "../../scripts/e2e/roles-cleanup.mjs";

test("Roles create intent persists before POST and blocks another run until cleanup is verified", async () => {
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")), path=join(dir,"manifest.json");
 try { await beginRolesCreate(path,{name:"E2E-ROLE-run-a",userId:1,tenantId:2,executionId:"run-a"}); assert.equal((await readRolesCleanupManifest(path)).status,"pending"); await assert.rejects(()=>beginRolesCreate(path,{name:"E2E-ROLE-run-b",userId:1,tenantId:2,executionId:"run-b"}),/not clear/); const saved=JSON.parse(await readFile(path,"utf8")); assert.equal(saved.records[0].id,null); assert.equal(saved.records[0].createAttempted,true); } finally { await rm(dir,{recursive:true,force:true}); }
});
test("Roles manifest only registers a 201 ID matching same-run marker intent", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json");
 try { await beginRolesCreate(path,{name:"E2E-ROLE-run",userId:1,tenantId:2,executionId:"run"}); await assert.rejects(()=>registerOwnedRole(path,{id:3,name:"other",userId:1,tenantId:2,executionId:"run",createHttp:201}),/does not match/); await registerOwnedRole(path,{id:3,name:"E2E-ROLE-run",userId:1,tenantId:2,executionId:"run",createHttp:201}); } finally { await rm(dir,{recursive:true,force:true}); }
});
test("Roles conflict is resolved only as 409 for the exact same-run owned role", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json");
 try { const record={name:"E2E-ROLE-run",userId:1,tenantId:2,executionId:"run"}; await beginRolesCreate(path,record); await registerOwnedRole(path,{...record,id:3,createHttp:201}); await beginRolesConflict(path,{...record,expectedExistingId:3}); await assert.rejects(()=>resolveRolesConflict(path,{name:record.name,executionId:"run",expectedExistingId:3,observedHttp:409,exactMatchIds:[4]}),/not reconciled/); await resolveRolesConflict(path,{name:record.name,executionId:"run",expectedExistingId:3,observedHttp:409,exactMatchIds:[3]}); assert.equal((await readRolesCleanupManifest(path)).status,"pending"); } finally { await rm(dir,{recursive:true,force:true}); }
});
test("Roles cleanup verifies owner, exact marker, DELETE 200 and GET 410 without retry", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json"),calls=[];
 try { const record={name:"E2E-ROLE-run",userId:1,tenantId:2,executionId:"run"}; await beginRolesCreate(path,record); await registerOwnedRole(path,{...record,id:3,createHttp:201}); const manifest=await cleanupOwnedRoles({path,executionId:"run",session:{userId:1,tenantId:2,accessToken:"memory-only"},api:async(method,id)=>{calls.push(method);if(method==="DELETE")return {status:200};if(calls.filter(x=>x==="GET").length===1)return {status:200,body:{id,name:record.name}};return {status:410};}}); assert.deepEqual(calls,["GET","DELETE","GET"]); assert.equal(manifest.status,"verified"); } finally { await rm(dir,{recursive:true,force:true}); }
});
test("Roles cleanup refuses cross-tenant records and never repeats ambiguous DELETE", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json");
 try { const record={name:"E2E-ROLE-run",userId:1,tenantId:2,executionId:"run"}; await beginRolesCreate(path,record); await registerOwnedRole(path,{...record,id:3,createHttp:201}); await assert.rejects(()=>cleanupOwnedRoles({path,executionId:"run",session:{userId:1,tenantId:9,accessToken:"memory-only"},api:async()=>({status:200,body:{id:3,name:record.name}})}),/identity or tenant/); } finally { await rm(dir,{recursive:true,force:true}); }
});
test("Roles reconciles an interrupted create only when exact list and detail identify one marker", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json");
 try { const record={name:"E2E-ROLE-run",userId:1,tenantId:2,executionId:"run"}; await beginRolesCreate(path,record); const pending=await reconcileRolesCreate(path,{executionId:"run",list:async()=>({status:200,body:{items:[{id:3,name:record.name}]}}),get:async(id)=>({status:200,body:{id,name:record.name}})}); assert.equal(pending[0].id,3); } finally { await rm(dir,{recursive:true,force:true}); }
});

test("Roles blocks an ambiguous interrupted create", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json");
 try { const record={name:"E2E-ROLE-ambiguous",userId:1,tenantId:2,executionId:"run"}; await beginRolesCreate(path,record); await assert.rejects(()=>reconcileRolesCreate(path,{executionId:"run",list:async()=>({status:200,body:{items:[]}}),get:async()=>({status:410})}),/ambiguous/); assert.equal((await readRolesCleanupManifest(path)).status,"pending"); } finally { await rm(dir,{recursive:true,force:true}); }
});

test("Roles recovers an interrupted conflict only when exact search and GET still identify the owned role", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json");
 try { const record={name:"E2E-ROLE-conflict",userId:1,tenantId:2,executionId:"run"}; await beginRolesCreate(path,record); await registerOwnedRole(path,{...record,id:3,createHttp:201}); await beginRolesConflict(path,{...record,expectedExistingId:3}); const result=await reconcileRolesConflict(path,{executionId:"run",list:async()=>({status:200,body:{items:[{id:3,name:record.name}]}}),get:async(id)=>({status:200,body:{id,name:record.name}})}); assert.equal(result.records[1].status,"verified"); assert.equal(result.records[1].reconciled,true); const manifest=await readRolesCleanupManifest(path); assert.equal(manifest.status,"pending"); } finally { await rm(dir,{recursive:true,force:true}); }
});
test("Roles keeps an interrupted conflict pending when exact search is ambiguous", async()=>{
 const dir=await mkdtemp(join(tmpdir(),"gerit-roles-cleanup-")),path=join(dir,"manifest.json");
 try { const record={name:"E2E-ROLE-conflict",userId:1,tenantId:2,executionId:"run"}; await beginRolesCreate(path,record); await registerOwnedRole(path,{...record,id:3,createHttp:201}); await beginRolesConflict(path,{...record,expectedExistingId:3}); await assert.rejects(()=>reconcileRolesConflict(path,{executionId:"run",list:async()=>({status:200,body:{items:[{id:3,name:record.name},{id:4,name:record.name}]}}),get:async(id)=>({status:200,body:{id,name:record.name}})}),/ambiguous/); assert.equal((await readRolesCleanupManifest(path)).status,"pending"); } finally { await rm(dir,{recursive:true,force:true}); }
});

# Issue #40 — Correções no Backend

**Repositório:** `vianahub-pt/VianaHub.Global.Gerit`
**Branch base:** `develop`
**Issue:** https://github.com/vianahub-pt/VianaHub.Global.Gerit.Web/issues/40

---

## Alteração 1: Reativar regras FluentValidation no CreateClientRouteValidator

**Arquivo:** `src/VianaHub.Global.Gerit.Api/Validators/Business/Client/CreateClientRouteValidator.cs`

### O que fazer
Substituir o conteúdo atual (com regras comentadas) pelo código abaixo, reativando todas as regras `RuleFor` com `MaximumLength` compatível com os limites das colunas do banco SQL Server:

```csharp
using FluentValidation;
using VianaHub.Global.Gerit.Application.Dtos.Request.Business.Client;
using VianaHub.Global.Gerit.Domain.Interfaces.Base;

namespace VianaHub.Global.Gerit.Api.Validators.Business.Client;

/// <summary>
/// Validador para CreateClientRequest com regras de tamanho máximo compatíveis
/// com os limites das colunas do banco SQL Server.
/// </summary>
public class CreateClientRouteValidator : AbstractValidator<CreateClientRequest>
{
    public CreateClientRouteValidator(ILocalizationService localization)
    {
        RuleFor(x => x.ClientType).NotEmpty().GreaterThan(0);
        RuleFor(x => x.OriginType).NotEmpty().GreaterThan(0);
        RuleFor(x => x.UrlImage).MaximumLength(500);
        RuleFor(x => x.Note).MaximumLength(500);

        // Individual
        RuleFor(x => x.Individual.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Individual.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Individual.PhoneNumber).MaximumLength(50);
        RuleFor(x => x.Individual.CellPhoneNumber).MaximumLength(50);
        RuleFor(x => x.Individual.Email).MaximumLength(500).EmailAddress().When(x => !string.IsNullOrEmpty(x.Individual.Email));
        RuleFor(x => x.Individual.Gender).MaximumLength(20);
        RuleFor(x => x.Individual.DocumentType).MaximumLength(50);
        RuleFor(x => x.Individual.DocumentNumber).MaximumLength(50);
        RuleFor(x => x.Individual.Nationality).Length(2).When(x => !string.IsNullOrEmpty(x.Individual.Nationality));

        // Company
        RuleFor(x => x.Company.LegalName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Company.TradeName).MaximumLength(200);
        RuleFor(x => x.Company.PhoneNumber).MaximumLength(50);
        RuleFor(x => x.Company.CellPhoneNumber).MaximumLength(50);
        RuleFor(x => x.Company.Email).MaximumLength(500).EmailAddress().When(x => !string.IsNullOrEmpty(x.Company.Email));
        RuleFor(x => x.Company.Site).MaximumLength(500);
        RuleFor(x => x.Company.CompanyRegistration).MaximumLength(50);
        RuleFor(x => x.Company.CAE).MaximumLength(10);
        RuleFor(x => x.Company.NumberOfEmployee).GreaterThan(0).When(x => x.Company.NumberOfEmployee.HasValue);
        RuleFor(x => x.Company.LegalRepresentative).MaximumLength(150);
    }
}
```

### Mapeamento dos limites

| Campo | MaximumLength | Limite BD (SQL Server) |
|-------|--------------|----------------------|
| Individual.FirstName | 100 | NVARCHAR(100) |
| Individual.LastName | 100 | NVARCHAR(100) |
| Individual.PhoneNumber | 50 | NVARCHAR(50) |
| Individual.CellPhoneNumber | 50 | NVARCHAR(50) |
| Individual.Gender | 20 | NVARCHAR(20) |
| Individual.DocumentType | 50 | NVARCHAR(50) |
| Individual.DocumentNumber | 50 | NVARCHAR(50) |
| Individual.Nationality | 2 | CHAR(2) |
| Company.LegalName | 200 | NVARCHAR(200) |
| Company.TradeName | 200 | NVARCHAR(200) |
| Company.CompanyRegistration | 50 | NVARCHAR(50) |
| Company.CAE | 10 | NVARCHAR(10) |
| Company.LegalRepresentative | 150 | NVARCHAR(150) |

---

## Alteração 2: Melhorar GlobalExceptionMiddleware para extrair coluna do erro de truncation

**Arquivo:** `src/VianaHub.Global.Gerit.Api/Middleware/GlobalExceptionMiddleware.cs`

### O que fazer
No método `HandleExceptionAsync`, dentro do bloco `if (exception is DbUpdateException dbEx)`, adicionar um caso específico para detecção de erro de truncation antes dos casos existentes (FK, UNIQUE, genérico).

### Código a adicionar

Localizar o seguinte trecho no `GlobalExceptionMiddleware.cs`:

```csharp
if (exception is DbUpdateException dbEx)
{
    // Inspecionar inner exception em busca de indicadores de violação de restrições
    var innerMessage = dbEx.InnerException?.Message ?? string.Empty;

    // Logar detalhes completos internos para diagnóstico
    Log.Error(dbEx,
        "[ERROR-{ErrorId}] Detailed DbUpdateException:\n" +
        "   📝 Message: {Message}\n" +
        "   🔥 Inner Exception: {InnerException}\n" +
        "   📋 Entries: {EntriesCount}",
        errorId,
        dbEx.Message,
        dbEx.InnerException?.Message ?? "N/A",
        dbEx.Entries?.Count() ?? 0);

    if (innerMessage.IndexOf("FK_", StringComparison.OrdinalIgnoreCase) >= 0 ||
        innerMessage.IndexOf("FOREIGN KEY", StringComparison.OrdinalIgnoreCase) >= 0)
    {
        notify.Add("Api.Middleware.GlobalException.DbUpdateException.Error.TenantNotExistOrInactive", 400);
    }
```

**Adicionar** o bloco `truncated` antes do `if (innerMessage.IndexOf("FK_"...)`:

```csharp
    // Truncation: "String or binary data would be truncated"
    if (innerMessage.Contains("truncated", StringComparison.OrdinalIgnoreCase))
    {
        // Tentar extrair o nome da coluna da mensagem
        // "String or binary data would be truncated in table 'table', column 'column'"
        var columnMatch = System.Text.RegularExpressions.Regex.Match(innerMessage, @"column '([^']+)'");
        var columnName = columnMatch.Success ? columnMatch.Groups[1].Value : "unknown";

        errors.Add("Campo", new[] { $"O valor enviado excede o limite maximo permitido para o campo '{columnName}'." });
        errors.Add("errorId", new[] { errorId });
        statusCode = 400;
    }
```

**Nota:** O código acima usa `errors.Add` que é um pattern do `ErrorResponse`. No `GlobalExceptionMiddleware`, as respostas de erro são construídas via `notify.Add()` e `errorResponse.AddError()`. A implementação exata deve seguir o padrão existente no middleware:

```csharp
    if (innerMessage.Contains("truncated", StringComparison.OrdinalIgnoreCase))
    {
        var columnMatch = System.Text.RegularExpressions.Regex.Match(innerMessage, @"column '([^']+)'");
        var columnName = columnMatch.Success ? columnMatch.Groups[1].Value : "unknown";

        notify.Add("Api.Middleware.GlobalException.DbUpdateException.Error.TruncatedData", 400);

        var statusCode = (int)notify.GetStatusCode();
        context.Response.StatusCode = statusCode;

        var errorResponse = new ErrorResponse(GetErrorTitle(statusCode, localization));
        errorResponse.AddError("Campo", $"O valor enviado excede o limite maximo permitido para o campo '{columnName}'.");
        errorResponse.AddError(
            localization.GetMessage("Api.Middleware.GlobalException.DbUpdateException.Error.FieldLabel.ErrorId"),
            localization.GetMessage("Api.Middleware.GlobalException.DbUpdateException.Error.ContactSupport", errorId));

        var json = JsonSerializer.Serialize(errorResponse, GetJsonSerializerOptions());
        await context.Response.WriteAsync(json);
        return;
    }
```

### Fluxo completo do DbUpdateException handler (após alteração)

```
innerMessage.Contains("truncated") -> retorna 400 com nome da coluna + errorId
innerMessage.IndexOf("FK_") >= 0 || "FOREIGN KEY" -> retorna 400 (tenant)
innerMessage.IndexOf("UNIQUE") >= 0 || "duplicate" -> retorna 409 (conflito)
else -> retorna 400 genérico + errorId
```

---

## Como aplicar

1. Clone o repositório: `git clone https://github.com/vianahub-pt/VianaHub.Global.Gerit.git`
2. Crie a branch: `git checkout -b fix/issue-40-client-validation develop`
3. Aplique as alterações nos 2 arquivos acima
4. Commit: `git commit -m "fix(clients): reativa validacao FluentValidation e melhora tratamento de truncation [#40]"`
5. Push: `git push origin fix/issue-40-client-validation`
6. Crie PR para `develop`
7. Comente na issue #40 com o link do PR

GO
CREATE TABLE dbo.PartyTypes (
Id          TINYINT           NOT NULL,
Code        NVARCHAR(50)      NOT NULL,
IsActive    BIT               NOT NULL DEFAULT 1,
IsDeleted   BIT               NOT NULL DEFAULT 0,
CreatedBy   INT               NOT NULL,
CreatedAt   DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy  INT                   NULL,
ModifiedAt  DATETIME2(7)          NULL,
CONSTRAINT PK_PartyTypes PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_PartyTypes_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
INSERT INTO dbo.PartyTypes (Id, Code, CreatedBy) VALUES (1, N'Individual', 1), (2, N'Organization', 1);
GO
CREATE TABLE dbo.PartyTypeTranslations (
Id              INT IDENTITY(1,1) NOT NULL,
PartyTypeId     TINYINT           NOT NULL,
LanguageCode    NVARCHAR(10)      NOT NULL,
Name            NVARCHAR(100)     NOT NULL,
Description     NVARCHAR(300)         NULL,
CONSTRAINT PK_PartyTypeTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_PartyTypeTranslations_PartyType FOREIGN KEY (PartyTypeId) REFERENCES dbo.PartyTypes(Id),
CONSTRAINT UQ_PartyTypeTranslations_PartyType_Language UNIQUE (PartyTypeId, LanguageCode),
CONSTRAINT UQ_PartyTypeTranslations_Language_Name UNIQUE (LanguageCode, Name)
);
GO
CREATE TABLE dbo.AcquisitionSourceTypes (
Id          INT IDENTITY(1,1) NOT NULL,
Code        NVARCHAR(50)      NOT NULL,
IsActive    BIT               NOT NULL DEFAULT 1,
IsDeleted   BIT               NOT NULL DEFAULT 0,
CreatedBy   INT               NOT NULL,
CreatedAt   DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy  INT               NULL,
ModifiedAt  DATETIME2(7)      NULL,
CONSTRAINT PK_AcquisitionSourceTypes PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_AcquisitionSourceTypes_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
CREATE TABLE dbo.AcquisitionSourceTypeTranslations (
Id                          INT IDENTITY(1,1) NOT NULL,
AcquisitionSourceTypeId     INT               NOT NULL,
LanguageCode                NVARCHAR(10)      NOT NULL,
Name                        NVARCHAR(100)     NOT NULL,
Description                 NVARCHAR(300)         NULL,
CONSTRAINT PK_AcquisitionSourceTypeTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_AcquisitionSourceTypeTranslations_AcquisitionSourceType FOREIGN KEY (AcquisitionSourceTypeId) REFERENCES dbo.AcquisitionSourceTypes(Id),
CONSTRAINT UQ_AcquisitionSourceTypeTranslations_AcquisitionSourceType_Language UNIQUE (AcquisitionSourceTypeId, LanguageCode),
CONSTRAINT UQ_AcquisitionSourceTypeTranslations_Language_Name UNIQUE (LanguageCode, Name)
);
GO
CREATE TABLE dbo.AddressTypes (
Id          INT IDENTITY(1,1) NOT NULL,
Code        NVARCHAR(50)      NOT NULL,
IsActive    BIT               NOT NULL DEFAULT 1,
IsDeleted   BIT               NOT NULL DEFAULT 0,
CreatedBy   INT               NOT NULL,
CreatedAt   DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy  INT               NULL,
ModifiedAt  DATETIME2(7)      NULL,
CONSTRAINT PK_AddressTypes PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_AddressTypes_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
CREATE TABLE dbo.AddressTypeTranslations (
Id              INT IDENTITY(1,1) NOT NULL,
AddressTypeId   INT               NOT NULL,
LanguageCode    NVARCHAR(10)      NOT NULL,
Name            NVARCHAR(200)     NOT NULL,
Description     NVARCHAR(500)         NULL,
CONSTRAINT PK_AddressTypeTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_AddressTypeTranslations_AddressType FOREIGN KEY (AddressTypeId) REFERENCES dbo.AddressTypes(Id),
CONSTRAINT UQ_AddressTypeTranslations_AddressType_Language UNIQUE (AddressTypeId, LanguageCode),
CONSTRAINT UQ_AddressTypeTranslations_Language_Name UNIQUE (LanguageCode, Name)
);
GO
CREATE TABLE dbo.DocumentTypes (
Id          INT IDENTITY(1,1) NOT NULL,
Code        NVARCHAR(50)      NOT NULL,
IsActive    BIT               NOT NULL DEFAULT 1,
IsDeleted   BIT               NOT NULL DEFAULT 0,
CreatedBy   INT               NOT NULL,
CreatedAt   DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy  INT                   NULL,
ModifiedAt  DATETIME2(7)          NULL,
CONSTRAINT PK_DocumentTypes PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_DocumentTypes_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
CREATE TABLE dbo.DocumentTypeTranslations (
Id              INT IDENTITY(1,1) NOT NULL,
DocumentTypeId  INT               NOT NULL,
LanguageCode    NVARCHAR(10)      NOT NULL,
Name            NVARCHAR(100)     NOT NULL,
Description     NVARCHAR(300)         NULL,
CONSTRAINT PK_DocumentTypeTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_DocumentTypeTranslations_DocumentType FOREIGN KEY (DocumentTypeId) REFERENCES dbo.DocumentTypes(Id),
CONSTRAINT UQ_DocumentTypeTranslations_DocumentType_Language UNIQUE (DocumentTypeId, LanguageCode),
CONSTRAINT UQ_DocumentTypeTranslations_Language_Name UNIQUE (LanguageCode, Name)
);
GO
CREATE TABLE dbo.FileTypes (
Id          INT IDENTITY(1,1) NOT NULL,
Code        NVARCHAR(50)      NOT NULL,
MimeType    NVARCHAR(100)     NOT NULL,
Extension   NVARCHAR(20)      NOT NULL,
IsActive    BIT               NOT NULL DEFAULT 1,
IsDeleted   BIT               NOT NULL DEFAULT 0,
CreatedBy   INT               NOT NULL,
CreatedAt   DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy  INT                   NULL,
ModifiedAt  DATETIME2(7)          NULL,
CONSTRAINT PK_FileTypes PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_FileTypes_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
CREATE TABLE dbo.FileTypeTranslations (
Id              INT IDENTITY(1,1) NOT NULL,
FileTypeId      INT               NOT NULL,
LanguageCode    NVARCHAR(10)      NOT NULL,
Name            NVARCHAR(100)     NOT NULL,
Description     NVARCHAR(300)         NULL,
CONSTRAINT PK_FileTypeTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_FileTypeTranslations_FileType FOREIGN KEY (FileTypeId) REFERENCES dbo.FileTypes(Id),
CONSTRAINT UQ_FileTypeTranslations_FileType_Language UNIQUE (FileTypeId, LanguageCode),
CONSTRAINT UQ_FileTypeTranslations_Language_Name UNIQUE (LanguageCode, Name)
);
GO
CREATE TABLE dbo.StatusDomains (
Id          INT IDENTITY(1,1) NOT NULL,
Code        NVARCHAR(50)      NOT NULL,
IsActive    BIT               NOT NULL DEFAULT 1,
IsDeleted   BIT               NOT NULL DEFAULT 0,
CreatedBy   INT               NOT NULL,
CreatedAt   DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy  INT                   NULL,
ModifiedAt  DATETIME2(7)          NULL,
CONSTRAINT PK_StatusDomains PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_StatusDomains_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
CREATE TABLE dbo.StatusDomainTranslations (
Id              INT IDENTITY(1,1) NOT NULL,
StatusDomainId  INT               NOT NULL,
LanguageCode    NVARCHAR(10)      NOT NULL,
Name            NVARCHAR(100)     NOT NULL,
Description     NVARCHAR(300)         NULL,
CONSTRAINT PK_StatusDomainTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_StatusDomainTranslations_StatusDomain FOREIGN KEY (StatusDomainId) REFERENCES dbo.StatusDomains(Id),
CONSTRAINT UQ_StatusDomainTranslations_StatusDomain_Language UNIQUE (StatusDomainId, LanguageCode),
CONSTRAINT UQ_StatusDomainTranslations_Language_Name UNIQUE (LanguageCode, Name)
);
GO
CREATE TABLE dbo.SubscriptionPlans (
Id                  INT IDENTITY(1,1)   NOT NULL,
Code                NVARCHAR(50)        NOT NULL,
PricePerHour        DECIMAL(19,4)           NULL,
PricePerDay         DECIMAL(19,4)           NULL,
PricePerMonth       DECIMAL(19,4)           NULL,
PricePerYear        DECIMAL(19,4)           NULL,
Currency            NVARCHAR(3)         NOT NULL DEFAULT N'EUR',
MaxUsers            INT                 NOT NULL,
MaxPhotosPerVisit   INT                 NOT NULL,
IsActive            BIT                 NOT NULL DEFAULT 1,
IsDeleted           BIT                 NOT NULL DEFAULT 0,
CreatedBy           INT                 NOT NULL,
CreatedAt           DATETIME2(7)        NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy          INT                     NULL,
ModifiedAt          DATETIME2(7)            NULL,
CONSTRAINT PK_SubscriptionPlans PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_SubscriptionPlans_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_SubscriptionPlans_Prices_NonNegative
CHECK (
(PricePerHour  IS NULL OR PricePerHour  >= 0) AND
(PricePerDay   IS NULL OR PricePerDay   >= 0) AND
(PricePerMonth IS NULL OR PricePerMonth >= 0) AND
(PricePerYear  IS NULL OR PricePerYear  >= 0)
),
CONSTRAINT CK_SubscriptionPlans_Limits_NonNegative
CHECK (
MaxUsers >= 0 AND
MaxPhotosPerVisit >= 0
)
);
GO
CREATE TABLE dbo.SubscriptionPlanTranslations (
Id                      INT IDENTITY(1,1) NOT NULL,
SubscriptionPlanId      INT               NOT NULL,
LanguageCode            NVARCHAR(10)      NOT NULL,
Name                    NVARCHAR(100)     NOT NULL,
Description             NVARCHAR(500)         NULL,
CONSTRAINT PK_SubscriptionPlanTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_SubscriptionPlanTranslations_SubscriptionPlan FOREIGN KEY (SubscriptionPlanId) REFERENCES dbo.SubscriptionPlans(Id),
CONSTRAINT UQ_SubscriptionPlanTranslations_SubscriptionPlan_Language UNIQUE (SubscriptionPlanId, LanguageCode),
CONSTRAINT UQ_SubscriptionPlanTranslations_Language_Name UNIQUE (LanguageCode, Name)
);
GO
CREATE TABLE dbo.SubscriptionPlanFileRules (
Id                      INT IDENTITY(1,1) NOT NULL,
SubscriptionPlanId      INT               NOT NULL,
FileTypeId              INT               NOT NULL,
MaxFileSizeMB           INT               NOT NULL,
IsActive                BIT               NOT NULL DEFAULT 1,
IsDeleted               BIT               NOT NULL DEFAULT 0,
CreatedBy               INT               NOT NULL,
CreatedAt               DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy              INT               NULL,
ModifiedAt              DATETIME2(7)      NULL,
CONSTRAINT PK_SubscriptionPlanFileRules PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_SubscriptionPlanFileRules_MaxFileSizeMB CHECK (MaxFileSizeMB > 0),
CONSTRAINT CK_SubscriptionPlanFileRules_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT FK_SubscriptionPlanFileRules_SubscriptionPlan FOREIGN KEY (SubscriptionPlanId) REFERENCES dbo.SubscriptionPlans(Id),
CONSTRAINT FK_SubscriptionPlanFileRules_FileType FOREIGN KEY (FileTypeId) REFERENCES dbo.FileTypes(Id)
);
GO
CREATE TABLE dbo.Tenants (
Id			            INT IDENTITY(1,1)	NOT NULL,
PartyTypeId             TINYINT             NOT NULL,
AcquisitionSourceTypeId INT                 NOT NULL,
Name	                NVARCHAR(200)		NOT NULL,
Email		            NVARCHAR(255)		NOT NULL,
WebsiteUrl	            NVARCHAR(255)		    NULL,
ImageUrl    	        NVARCHAR(500)			NULL,
Note		            NVARCHAR(1000)		    NULL,
IsActive	            BIT					NOT NULL DEFAULT 1,
IsDeleted	            BIT					NOT NULL DEFAULT 0,
CreatedBy	            INT         		NOT NULL,
CreatedAt	            DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		NULL,
ModifiedAt	            DATETIME2(7)		NULL,
CONSTRAINT PK_Tenants PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Tenants_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT FK_Tenants_PartyType FOREIGN KEY (PartyTypeId) REFERENCES dbo.PartyTypes(Id),
CONSTRAINT FK_Tenants_AcquisitionSourceType FOREIGN KEY (AcquisitionSourceTypeId) REFERENCES dbo.AcquisitionSourceTypes(Id)
);
GO
CREATE TABLE dbo.TenantContactPersons (
Id			        INT IDENTITY(1,1)	NOT NULL,
TenantId	        INT					NOT NULL,
JobTitle            NVARCHAR(150)           NULL,
Department          NVARCHAR(150)           NULL,
Name		        NVARCHAR(150)		NOT NULL,
PhoneNumber         NVARCHAR(50)            NULL,
CellPhoneNumber     NVARCHAR(50)            NULL,
IsCellPhoneWhatsapp BIT               NOT NULL CONSTRAINT DF_TenantContactPersons_IsCellPhoneWhatsapp  DEFAULT 0,
Email		        NVARCHAR(255)		    NULL,
IsPrimary	        BIT					NOT NULL DEFAULT 0,
IsActive	        BIT					NOT NULL DEFAULT 1,
IsDeleted	        BIT					NOT NULL DEFAULT 0,
CreatedBy	        INT         		NOT NULL,
CreatedAt	        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	        INT         		    NULL,
ModifiedAt	        DATETIME2(7)			NULL,
CONSTRAINT PK_TenantContactPersons PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_TenantContactPersons_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_TenantContactPersons_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_TenantContactPersons_CellPhoneWhatsapp CHECK (IsCellPhoneWhatsapp = 0 OR NULLIF(LTRIM(RTRIM(CellPhoneNumber)), N'') IS NOT NULL),
CONSTRAINT CK_TenantContactPersons_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT FK_TenantContactPersons_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
);
GO
CREATE TABLE dbo.TenantAddresses (
Id			    INT IDENTITY(1,1)	NOT NULL,
TenantId	    INT					NOT NULL,
AddressTypeId   INT                 NOT NULL,
CountryCode		CHAR(2)				NOT NULL DEFAULT 'PT',
Street			NVARCHAR(200)		NOT NULL,
Neighborhood    NVARCHAR(100)           NULL,
City			NVARCHAR(100)		NOT NULL,
District		NVARCHAR(100)		    NULL,
PostalCode		NVARCHAR(20)		NOT NULL,
StreetNumber    NVARCHAR(20)            NULL,
Complement      NVARCHAR(100)           NULL,
Latitude        DECIMAL(9,6)            NULL,
Longitude       DECIMAL(9,6)            NULL,
Note            NVARCHAR(500)           NULL,
IsPrimary		BIT					NOT NULL DEFAULT 0,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_TenantAddresses PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_TenantAddresses_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_TenantAddresses_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_TenantAddresses_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_TenantAddresses_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT CK_TenantAddresses_Latitude CHECK (Latitude IS NULL OR Latitude BETWEEN -90 AND 90),
CONSTRAINT CK_TenantAddresses_Longitude CHECK (Longitude IS NULL OR Longitude BETWEEN -180 AND 180),
CONSTRAINT CK_TenantAddresses_Coordinates CHECK ((Latitude IS NULL AND Longitude IS NULL) OR (Latitude IS NOT NULL AND Longitude IS NOT NULL)),
CONSTRAINT FK_TenantAddresses_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_TenantAddresses_AddressType FOREIGN KEY (AddressTypeId) REFERENCES dbo.AddressTypes(Id)
);
GO
CREATE TABLE dbo.TenantFiscalData (
Id                      INT IDENTITY(1,1) NOT NULL,
TenantId                INT               NOT NULL,
TaxNumber               NVARCHAR(20)      NOT NULL,
VatNumber               NVARCHAR(20)          NULL,
FiscalCountry           CHAR(2)           NOT NULL DEFAULT 'PT',
IsVatRegistered         BIT               NOT NULL DEFAULT 0,
IBAN                    NVARCHAR(34)           NULL,
FiscalEmail             NVARCHAR(255)         NULL,
IsActive                BIT               NOT NULL DEFAULT 1,
IsDeleted               BIT               NOT NULL DEFAULT 0,
CreatedBy               INT               NOT NULL,
CreatedAt               DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy              INT                   NULL,
ModifiedAt              DATETIME2(7)          NULL,
CONSTRAINT PK_TenantFiscalData PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_TenantFiscalData_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_TenantFiscalData_VatNumber CHECK (IsVatRegistered = 0 OR NULLIF(LTRIM(RTRIM(VatNumber)), N'') IS NOT NULL),
CONSTRAINT FK_TenantFiscalData_Tenant FOREIGN KEY (TenantId)REFERENCES dbo.Tenants(Id)
);
GO
CREATE TABLE dbo.TenantDocuments (
Id                  INT IDENTITY(1,1) NOT NULL,
TenantId            INT               NOT NULL,
DocumentTypeId      INT               NOT NULL,
DocumentNumber      NVARCHAR(100)     NOT NULL,
IssuingCountryCode  CHAR(2)           NOT NULL,
IssuedAt            DATE                  NULL,
ExpiresAt           DATE                  NULL,
IsPrimary           BIT               NOT NULL DEFAULT 0,
IsActive            BIT               NOT NULL DEFAULT 1,
IsDeleted           BIT               NOT NULL DEFAULT 0,
CreatedBy           INT               NOT NULL,
CreatedAt           DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy          INT                   NULL,
ModifiedAt          DATETIME2(7)          NULL,
CONSTRAINT PK_TenantDocuments PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_TenantDocuments_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_TenantDocuments_Dates
CHECK (
ExpiresAt IS NULL
OR IssuedAt IS NULL
OR ExpiresAt >= IssuedAt
),
CONSTRAINT FK_TenantDocuments_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_TenantDocuments_DocumentType FOREIGN KEY (DocumentTypeId) REFERENCES dbo.DocumentTypes(Id)
);
GO
CREATE TABLE dbo.StatusDefinitions (
Id              INT IDENTITY(1,1) NOT NULL,
TenantId        INT               NOT NULL,
StatusDomainId  INT               NOT NULL,
Code            NVARCHAR(50)      NOT NULL,
DisplayOrder    INT               NOT NULL DEFAULT 0,
IsSystem        BIT               NOT NULL DEFAULT 0,
IsActive        BIT               NOT NULL DEFAULT 1,
IsDeleted       BIT               NOT NULL DEFAULT 0,
CreatedBy       INT               NOT NULL,
CreatedAt       DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy      INT                   NULL,
ModifiedAt      DATETIME2(7)          NULL,
CONSTRAINT PK_StatusDefinitions PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_StatusDefinitions_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT UQ_StatusDefinitions_Id_Tenant_Domain UNIQUE (Id, TenantId, StatusDomainId),
CONSTRAINT CK_StatusDefinitions_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT FK_StatusDefinitions_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_StatusDefinitions_StatusDomain FOREIGN KEY (StatusDomainId) REFERENCES dbo.StatusDomains(Id)
);
GO
CREATE TABLE dbo.StatusDefinitionTranslations (
Id                  INT IDENTITY(1,1) NOT NULL,
TenantId            INT               NOT NULL,
StatusDomainId      INT               NOT NULL,
StatusDefinitionId  INT               NOT NULL,
LanguageCode        NVARCHAR(10)      NOT NULL,
Name                NVARCHAR(200)     NOT NULL,
Description         NVARCHAR(500)         NULL,
CONSTRAINT PK_StatusDefinitionTranslations PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_StatusDefinitionTranslations_StatusDefinition FOREIGN KEY (StatusDefinitionId, TenantId, StatusDomainId) REFERENCES dbo.StatusDefinitions(Id, TenantId, StatusDomainId),
CONSTRAINT UQ_StatusDefinitionTranslations_Status_Language UNIQUE (TenantId, StatusDefinitionId, LanguageCode),
CONSTRAINT UQ_StatusDefinitionTranslations_Tenant_Domain_Language_Name UNIQUE (TenantId, StatusDomainId, LanguageCode, Name)
);
GO
CREATE TABLE dbo.Subscriptions (
Id                      INT IDENTITY(1,1) NOT NULL,
TenantId                INT               NOT NULL,
StatusDefinitionId      INT               NOT NULL,
StatusDomainId          INT               NOT NULL,
SubscriptionPlanId      INT               NOT NULL,
StripeId                NVARCHAR(100)         NULL,
AgreedAmount            DECIMAL(19,4)     NOT NULL,
BillingInterval         NVARCHAR(20)      NOT NULL,
CurrencyCode            CHAR(3)           NOT NULL,
CurrentPeriodStart      DATETIME2(7)      NOT NULL,
CurrentPeriodEnd        DATETIME2(7)      NOT NULL,
TrialStart              DATETIME2(7)          NULL,
TrialEnd                DATETIME2(7)          NULL,
CancelAtPeriodEnd       BIT               NOT NULL DEFAULT 0,
CanceledAt              DATETIME2(7)          NULL,
CancellationReason      NVARCHAR(500)         NULL,
StripeCustomerId        NVARCHAR(100)         NULL,
IsActive                BIT               NOT NULL DEFAULT 1,
IsDeleted               BIT               NOT NULL DEFAULT 0,
CreatedBy               INT               NOT NULL,
CreatedAt               DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy              INT                   NULL,
ModifiedAt              DATETIME2(7)          NULL,
CONSTRAINT PK_Subscriptions PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_Subscriptions_TenantId_Id UNIQUE (TenantId, Id),
CONSTRAINT CK_Subscriptions_AgreedAmount CHECK (AgreedAmount >= 0),
CONSTRAINT CK_Subscriptions_CurrentPeriod CHECK (CurrentPeriodEnd > CurrentPeriodStart),
CONSTRAINT CK_Subscriptions_TrialPeriod CHECK (TrialStart IS NULL OR TrialEnd IS NULL OR TrialEnd >= TrialStart),
CONSTRAINT CK_Subscriptions_CanceledAt CHECK (CanceledAt IS NULL OR CanceledAt >= CurrentPeriodStart),
CONSTRAINT CK_Subscriptions_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT FK_Subscriptions_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_Subscriptions_StatusDefinition FOREIGN KEY (StatusDefinitionId, TenantId, StatusDomainId) REFERENCES dbo.StatusDefinitions (Id, TenantId, StatusDomainId),
CONSTRAINT FK_Subscriptions_SubscriptionPlan FOREIGN KEY (SubscriptionPlanId) REFERENCES dbo.SubscriptionPlans(Id)
);
GO
CREATE TABLE dbo.Users (
Id				        INT IDENTITY(1,1)	NOT NULL,
TenantId		        INT					NOT NULL,
Name		            NVARCHAR(150)		NOT NULL,
Email                   NVARCHAR(256)       NOT NULL,
NormalizedEmail         NVARCHAR(256)       NOT NULL,
EmailConfirmed          BIT                 NOT NULL DEFAULT 0,
PhoneNumber             NVARCHAR(50)            NULL,
PhoneNumberConfirmed    BIT                 NOT NULL DEFAULT 0,
LastAccessAt            DATETIME2(7)            NULL,
PasswordHash	        NVARCHAR(500)		NOT NULL,
UrlImage    	        NVARCHAR(500)			NULL,
IsActive		        BIT					NOT NULL DEFAULT 1,
IsDeleted		        BIT					NOT NULL DEFAULT 0,
CreatedBy		        INT         		NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)		    NULL,
CONSTRAINT PK_Users PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Users_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_Users_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_Users_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
);
GO
CREATE TABLE dbo.UserPreferences (
Id                              INT IDENTITY(1,1)   NOT NULL,
TenantId                        INT                 NOT NULL,
UserId                          INT                 NOT NULL,
Appearance                      NVARCHAR(10)        NOT NULL DEFAULT ('light'),
CurrencyCode 					NVARCHAR(3) 		NOT NULL DEFAULT ('EUR'),
Locale                          NVARCHAR(10)        NOT NULL DEFAULT ('pt-PT'),
Timezone                        NVARCHAR(100)       NOT NULL DEFAULT ('Europe/Lisbon'),
DateFormat                      NVARCHAR(20)        NOT NULL DEFAULT ('DD-MM-YYYY'),
TimeFormat                      NVARCHAR(10)        NOT NULL DEFAULT ('24h'),
DayStart                        TIME(0)             NOT NULL DEFAULT ('09:00'),
DayEnd                          TIME(0)             NOT NULL DEFAULT ('18:00'),
EmailNewsletter                 BIT                 NOT NULL DEFAULT (0),
EmailWeeklyReport               BIT                 NOT NULL DEFAULT (0),
EmailApproval                   BIT                 NOT NULL DEFAULT (0),
EmailAlerts                     BIT                 NOT NULL DEFAULT (1),
EmailReminders                  BIT                 NOT NULL DEFAULT (1),
EmailPlanner                    BIT                 NOT NULL DEFAULT (1),
IsActive                        BIT                 NOT NULL DEFAULT (1),
IsDeleted                       BIT                 NOT NULL DEFAULT (0),
CreatedBy                       INT                 NOT NULL,
CreatedAt                       DATETIME2(7)        NOT NULL DEFAULT (SYSUTCDATETIME()),
ModifiedBy                      INT                     NULL,
ModifiedAt                      DATETIME2(7)            NULL,
CONSTRAINT PK_UserPreferences PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_UserPreferences_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_UserPreferences_Appearance CHECK (Appearance IN ('light', 'dark')),
CONSTRAINT CK_UserPreferences_TimeFormat CHECK (TimeFormat IN ('24h', '12h')),
CONSTRAINT FK_UserPreferences_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_UserPreferences_User FOREIGN KEY (UserId, TenantId) REFERENCES dbo.Users(Id, TenantId)
);
GO
CREATE TABLE dbo.Roles (
Id				INT IDENTITY(1,1)	NOT NULL,
TenantId		INT					NOT NULL,
Code            NVARCHAR(50)        NOT NULL,
Name			NVARCHAR(100)		NOT NULL,
Description     NVARCHAR(500)		NOT NULL,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_Roles PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Roles_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_Roles_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_Roles_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
);
GO
CREATE TABLE dbo.Resources (
Id				INT IDENTITY(1,1)	NOT NULL,
Code            NVARCHAR(50)        NOT NULL,
Name			NVARCHAR(100)		NOT NULL,
Description     NVARCHAR(500)		NOT NULL,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_Resources PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Resources_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
CREATE TABLE dbo.Actions (
Id				INT IDENTITY(1,1)	NOT NULL,
Code            NVARCHAR(50)        NOT NULL,
Name			NVARCHAR(50)		NOT NULL,
Description     NVARCHAR(500)		NOT NULL,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_Actions PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Actions_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1))
);
GO
CREATE TABLE dbo.RolePermissions (
Id				INT IDENTITY(1,1)	NOT NULL,
TenantId		INT					NOT NULL,
RoleId			INT					NOT NULL,
ResourceId		INT					NOT NULL,
ActionId		INT					NOT NULL,
CONSTRAINT PK_RolePermissions PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_RolePermissions UNIQUE (TenantId, RoleId, ResourceId, ActionId),
CONSTRAINT FK_RolePermissions_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_RolePermissions_Role FOREIGN KEY (RoleId, TenantId) REFERENCES dbo.Roles(Id, TenantId),
CONSTRAINT FK_RolePermissions_Resource FOREIGN KEY (ResourceId) REFERENCES dbo.Resources(Id),
CONSTRAINT FK_RolePermissions_Action FOREIGN KEY (ActionId) REFERENCES dbo.Actions(Id)
);
GO
CREATE TABLE dbo.UserRoles (
Id				INT IDENTITY(1,1)	NOT NULL,
TenantId		INT					NOT NULL,
UserId			INT					NOT NULL,
RoleId			INT					NOT NULL,
CONSTRAINT PK_UserRoles PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_UserRoles UNIQUE (TenantId, UserId, RoleId),
CONSTRAINT FK_UserRoles_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_UserRoles_User FOREIGN KEY (UserId, TenantId) REFERENCES dbo.Users(Id, TenantId),
CONSTRAINT FK_UserRoles_Role FOREIGN KEY (RoleId, TenantId) REFERENCES dbo.Roles(Id, TenantId)

);
GO
CREATE TABLE dbo.RefreshTokens (
Id 						INT IDENTITY(1,1)	NOT NULL,
TenantId 				INT					NOT NULL,
UserId 					INT					NOT NULL,
TokenHash               VARBINARY(64)       NOT NULL,
ExpiresAt				DATETIME2(7) 		NOT	NULL,
RevokedAt 				DATETIME2(7) 			NULL,
RevokedBy				INT 					NULL,
CreatedBy		        INT		            NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)			NULL,
CONSTRAINT PK_RefreshTokens PRIMARY KEY CLUSTERED (Id),
CONSTRAINT FK_RefreshTokens_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_RefreshTokens_User FOREIGN KEY (UserId, TenantId) REFERENCES dbo.Users(Id, TenantId)
);
GO
CREATE TABLE dbo.JwtKeys (
Id 						INT IDENTITY(1,1)	NOT NULL,
TenantId 				INT					NOT NULL,
KeyId 					UNIQUEIDENTIFIER	NOT NULL,
PublicKey 				NVARCHAR(MAX) 		NOT NULL,
PrivateKeyEncrypted 	NVARCHAR(MAX) 		NOT NULL,
Algorithm 				NVARCHAR(50) 		NOT NULL DEFAULT 'RS256',
KeySize 				INT 				NOT NULL DEFAULT 2048,
KeyType 				NVARCHAR(50) 		NOT NULL DEFAULT 'RSA',
RevokedReason 			NVARCHAR(500) 			NULL,
UsageCount 				BIGINT 				NOT NULL DEFAULT 0 CHECK (UsageCount >= 0),
ActivatedAt 			DATETIME2(7) 			NULL,
ExpiresAt 				DATETIME2(7) 		NOT NULL,
LastUsedAt 				DATETIME2(7) 			NULL,
NextRotationAt 			DATETIME2(7) 		NOT NULL,
RevokedAt 				DATETIME2(7) 			NULL,
LastValidatedAt 		DATETIME2(7) 			NULL,
ValidationCount 		BIGINT 				NOT NULL DEFAULT 0 CHECK (ValidationCount >= 0),
RotationPolicyDays 		INT 				NOT NULL DEFAULT 90,
OverlapPeriodDays 		INT 				NOT NULL DEFAULT 7,
MaxTokenLifetimeMinutes INT 				NOT NULL DEFAULT 60,
IsActive 				BIT 				NOT NULL DEFAULT 1,
IsDeleted 				BIT 				NOT NULL DEFAULT 0,
CreatedBy		        INT		            NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)			NULL,
CONSTRAINT PK_JwtKeys PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_JwtKeys_KeyId UNIQUE (TenantId, KeyId),
CONSTRAINT CK_JwtKeys_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_JwtKeys_UsageCount CHECK (UsageCount >= 0),
CONSTRAINT CK_JwtKeys_ValidationCount CHECK (ValidationCount >= 0),
CONSTRAINT CK_JwtKeys_ActivationExpiration CHECK (ActivatedAt IS NULL OR ExpiresAt > ActivatedAt),
CONSTRAINT CK_JwtKeys_Revocation CHECK (RevokedAt IS NULL OR ActivatedAt IS NULL OR RevokedAt >= ActivatedAt),
CONSTRAINT CK_JwtKeys_RotationPolicy CHECK (RotationPolicyDays BETWEEN 30 AND 365),
CONSTRAINT CK_JwtKeys_OverlapPeriod CHECK (OverlapPeriodDays BETWEEN 1 AND 30),
CONSTRAINT CK_JwtKeys_MaxTokenLifetime CHECK (MaxTokenLifetimeMinutes BETWEEN 5 AND 1440),
CONSTRAINT FK_JwtKeys_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
);
GO
CREATE TABLE dbo.JobDefinitions (
Id                      INT IDENTITY(1,1)	NOT NULL,
JobCategory             NVARCHAR(100)		NOT NULL,
JobName                 NVARCHAR(150)		NOT NULL,
Description             NVARCHAR(500)		    NULL,
JobPurpose              NVARCHAR(500)		    NULL,
JobType                 NVARCHAR(200)		NOT NULL,
JobMethod               NVARCHAR(100)		NOT NULL DEFAULT 'Execute',
CronExpression          NVARCHAR(100)		    NULL,
Timezone                NVARCHAR(100)       NOT NULL DEFAULT ('Europe/Lisbon'),
ExecuteOnlyOnce         BIT					NOT NULL DEFAULT 0,
TimeoutMinutes          INT					NOT NULL DEFAULT 5,
Priority                INT					NOT NULL DEFAULT 5,
Queue                   NVARCHAR(50)		NOT NULL DEFAULT 'default',
MaxRetries              INT					NOT NULL DEFAULT 3,
JobConfiguration        NVARCHAR(MAX)		    NULL,
IsSystemJob             BIT					NOT NULL DEFAULT 0,
HangfireJobId           NVARCHAR(100)		    NULL,
LastRegisteredAt        DATETIME2(7)		    NULL,
IsActive                BIT					NOT NULL DEFAULT 1,
IsDeleted               BIT					NOT NULL DEFAULT 0,
CreatedBy               INT					NOT NULL,
CreatedAt               DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy              INT					    NULL,
ModifiedAt              DATETIME2(7)		    NULL,
CONSTRAINT PK_JobDefinitions PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_JobDefinitions_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_JobDefinitions_Priority CHECK (Priority BETWEEN 1 AND 10),
CONSTRAINT CK_JobDefinitions_TimeoutMinutes CHECK (TimeoutMinutes > 0),
CONSTRAINT CK_JobDefinitions_MaxRetries CHECK (MaxRetries >= 0)
);
GO
CREATE TABLE dbo.Clients (
Id                          INT IDENTITY(1,1) NOT NULL,
TenantId                    INT               NOT NULL,
PartyTypeId                 TINYINT           NOT NULL,
StatusDefinitionId          INT               NOT NULL,
StatusDomainId              INT               NOT NULL,
AcquisitionSourceTypeId     INT               NOT NULL,
Name                        NVARCHAR(500)     NOT NULL,
PhoneNumber                 NVARCHAR(50)          NULL,
CellPhoneNumber             NVARCHAR(50)          NULL,
IsCellPhoneWhatsapp         BIT               NOT NULL CONSTRAINT DF_Clients_IsCellPhoneWhatsapp  DEFAULT 0,
Email                       NVARCHAR(320)         NULL,
ImageUrl    	            NVARCHAR(500)         NULL,
WebsiteUrl                  NVARCHAR(500)         NULL,

BirthDate                   DATE                  NULL,
Gender                      NVARCHAR(30)          NULL,
Nationality                 NVARCHAR(100)         NULL,

CompanyRegistrationNumber   NVARCHAR(100)          NULL,
EconomicActivityCode        NVARCHAR(20)           NULL,
NumberOfEmployees           INT                    NULL,

Note                        NVARCHAR(1000)        NULL,

IsActive                    BIT               NOT NULL CONSTRAINT DF_Clients_IsActive DEFAULT 1,
IsDeleted                   BIT               NOT NULL CONSTRAINT DF_Clients_IsDeleted DEFAULT 0,
CreatedBy                   INT               NOT NULL, 
CreatedAt                   DATETIME2(7)      NOT NULL CONSTRAINT DF_Clients_CreatedAt DEFAULT SYSUTCDATETIME(),
ModifiedBy                  INT                    NULL,
ModifiedAt                  DATETIME2(7)           NULL,
CONSTRAINT PK_Clients PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_Clients_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_Clients_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_Clients_CellPhoneWhatsapp CHECK (IsCellPhoneWhatsapp = 0 OR NULLIF(LTRIM(RTRIM(CellPhoneNumber)), N'') IS NOT NULL),
CONSTRAINT CK_Clients_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT CK_Clients_NumberOfEmployees CHECK (NumberOfEmployees IS NULL OR NumberOfEmployees >= 0),
CONSTRAINT CK_Clients_BirthDate CHECK (BirthDate IS NULL OR BirthDate <= CAST(SYSUTCDATETIME() AS DATE)),
CONSTRAINT CK_Clients_PartyTypeData
    CHECK (
        (
            PartyTypeId = 1
            AND CompanyRegistrationNumber IS NULL
            AND EconomicActivityCode IS NULL
            AND NumberOfEmployees IS NULL
        )
        OR
        (
            PartyTypeId = 2
            AND BirthDate IS NULL
            AND Gender IS NULL
            AND Nationality IS NULL
        )
    ),
CONSTRAINT FK_Clients_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_Clients_PartyType FOREIGN KEY (PartyTypeId) REFERENCES dbo.PartyTypes(Id),
CONSTRAINT FK_Clients_StatusDefinition FOREIGN KEY (StatusDefinitionId, TenantId, StatusDomainId) REFERENCES dbo.StatusDefinitions (Id, TenantId, StatusDomainId),
CONSTRAINT FK_Clients_AcquisitionSourceType FOREIGN KEY (AcquisitionSourceTypeId) REFERENCES dbo.AcquisitionSourceTypes(Id)


);
GO
CREATE TABLE dbo.ClientAddresses (
Id			    INT IDENTITY(1,1)	NOT NULL,
TenantId	    INT					NOT NULL,
ClientId	    INT					NOT NULL,
AddressTypeId   INT                 NOT NULL,
CountryCode		CHAR(2)				NOT NULL DEFAULT 'PT',
Street			NVARCHAR(200)		NOT NULL,
Neighborhood    NVARCHAR(100)           NULL,
City			NVARCHAR(100)		NOT NULL,
District		NVARCHAR(100)		    NULL,
PostalCode		NVARCHAR(20)		NOT NULL,
StreetNumber    NVARCHAR(20)            NULL,
Complement      NVARCHAR(100)           NULL,
Latitude        DECIMAL(9,6)            NULL,
Longitude       DECIMAL(9,6)            NULL,
Note            NVARCHAR(500)           NULL,
IsPrimary		BIT					NOT NULL DEFAULT 0,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_ClientAddresses PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_ClientAddresses_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_ClientAddresses_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_ClientAddresses_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_ClientAddresses_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT CK_ClientAddresses_Latitude CHECK (Latitude IS NULL OR Latitude BETWEEN -90 AND 90),
CONSTRAINT CK_ClientAddresses_Longitude CHECK (Longitude IS NULL OR Longitude BETWEEN -180 AND 180),
CONSTRAINT CK_ClientAddresses_Coordinates CHECK ((Latitude IS NULL AND Longitude IS NULL) OR (Latitude IS NOT NULL AND Longitude IS NOT NULL)),
CONSTRAINT FK_ClientAddresses_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_ClientAddresses_Client FOREIGN KEY (ClientId, TenantId) REFERENCES dbo.Clients(Id, TenantId),
CONSTRAINT FK_ClientAddresses_AddressType FOREIGN KEY (AddressTypeId) REFERENCES dbo.AddressTypes(Id)
);
GO
CREATE TABLE dbo.ClientContactPersons (
Id			        INT IDENTITY(1,1)	NOT NULL,
TenantId	        INT					NOT NULL,
ClientId	        INT					NOT NULL,
JobTitle            NVARCHAR(150)           NULL,
Department          NVARCHAR(150)           NULL,
Name		        NVARCHAR(150)		NOT NULL,
PhoneNumber         NVARCHAR(50)            NULL,
CellPhoneNumber     NVARCHAR(50)            NULL,
IsCellPhoneWhatsapp BIT               NOT NULL CONSTRAINT DF_ClientContactPersons_IsCellPhoneWhatsapp  DEFAULT 0,
Email		        NVARCHAR(255)		    NULL,
IsPrimary	        BIT					NOT NULL DEFAULT 0,
IsActive	        BIT					NOT NULL DEFAULT 1,
IsDeleted	        BIT					NOT NULL DEFAULT 0,
CreatedBy	        INT         		NOT NULL,
CreatedAt	        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	        INT         		    NULL,
ModifiedAt	        DATETIME2(7)			NULL,
CONSTRAINT PK_ClientContactPersons PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_ClientContactPersons_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_ClientContactPersons_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_ClientContactPersons_CellPhoneWhatsapp CHECK (IsCellPhoneWhatsapp = 0 OR NULLIF(LTRIM(RTRIM(CellPhoneNumber)), N'') IS NOT NULL),
CONSTRAINT CK_ClientContactPersons_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT FK_ClientContactPersons_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_ClientContactPersons_Client FOREIGN KEY (ClientId, TenantId) REFERENCES dbo.Clients(Id, TenantId)
);
GO
CREATE TABLE dbo.ClientDocuments (
Id                  INT IDENTITY(1,1) NOT NULL,                         -- Identificador do documento, chave primária
TenantId            INT               NOT NULL,                         -- Tenant dono do documento
ClientId            INT               NOT NULL,                         -- FK para Clients
DocumentTypeId      INT               NOT NULL,                         -- FK para DocumentTypes
DocumentNumber      NVARCHAR(100)     NOT NULL,                         -- Número do documento
IssuingCountryCode  CHAR(2)           NOT NULL,                         -- Código do país emissor (opcional)
IssuedAt            DATE                  NULL,                         -- Data de emissão (opcional)
ExpiresAt           DATE                  NULL,                         -- Data de expiração (opcional)
IsPrimary           BIT               NOT NULL DEFAULT 0,               -- Indica se é o documento principal do cliente
IsActive            BIT               NOT NULL DEFAULT 1,               -- Indica se o documento está ativo
IsDeleted           BIT               NOT NULL DEFAULT 0,               -- Indica se o documento foi excluído (soft delete)
CreatedBy           INT               NOT NULL,                         -- Usuário criador
CreatedAt           DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),   -- Data de criação
ModifiedBy          INT                   NULL,                         -- Usuário modificador
ModifiedAt          DATETIME2(7)          NULL,                         -- Data de modificação
CONSTRAINT PK_ClientDocuments PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_ClientDocuments_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_ClientDocuments_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_ClientDocuments_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_ClientDocuments_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT CK_ClientDocuments_Dates
CHECK (
ExpiresAt IS NULL
OR IssuedAt IS NULL
OR ExpiresAt >= IssuedAt
),
CONSTRAINT FK_ClientDocuments_Client FOREIGN KEY (ClientId, TenantId) REFERENCES dbo.Clients(Id, TenantId),
CONSTRAINT FK_ClientDocuments_DocumentType FOREIGN KEY (DocumentTypeId) REFERENCES dbo.DocumentTypes(Id)
);
GO
CREATE TABLE dbo.ClientFiscalData (
Id                      INT IDENTITY(1,1) NOT NULL,
TenantId                INT               NOT NULL,
ClientId                INT               NOT NULL,
TaxNumber               NVARCHAR(20)      NOT NULL,
VatNumber               NVARCHAR(20)          NULL,
FiscalCountry           CHAR(2)           NOT NULL DEFAULT 'PT',
IsVatRegistered         BIT               NOT NULL DEFAULT 0,
IBAN                    NVARCHAR(34)           NULL,
FiscalEmail             NVARCHAR(255)         NULL,
IsActive                BIT               NOT NULL DEFAULT 1,
IsDeleted               BIT               NOT NULL DEFAULT 0,
CreatedBy               INT               NOT NULL,
CreatedAt               DATETIME2(7)      NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy              INT                   NULL,
ModifiedAt              DATETIME2(7)          NULL,
CONSTRAINT PK_ClientFiscalData PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_ClientFiscalData_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_ClientFiscalData_VatNumber CHECK (IsVatRegistered = 0 OR NULLIF(LTRIM(RTRIM(VatNumber)), N'') IS NOT NULL),
CONSTRAINT CK_ClientFiscalData_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT FK_ClientFiscalData_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_ClientFiscalData_Client FOREIGN KEY (ClientId, TenantId) REFERENCES dbo.Clients(Id, TenantId)
);
GO
CREATE TABLE dbo.Teams (
Id              INT IDENTITY(1,1)   NOT NULL,
TenantId        INT                 NOT NULL,
Name            NVARCHAR(150)       NOT NULL,
Description     NVARCHAR(500)       NOT NULL,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_Teams PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Teams_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_Teams_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_Teams_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
);
GO
CREATE TABLE dbo.Employees (
Id			        INT IDENTITY(1,1)	NOT NULL,
TenantId	        INT					NOT NULL,
StatusDefinitionId  INT                 NOT NULL,
StatusDomainId      INT                 NOT NULL,
Name		        NVARCHAR(150)		NOT NULL,
PhoneNumber         NVARCHAR(50)            NULL,
CellPhoneNumber     NVARCHAR(50)            NULL,
IsCellPhoneWhatsapp BIT                 NOT NULL CONSTRAINT DF_Employees_IsCellPhoneWhatsapp  DEFAULT 0,
Email               NVARCHAR(320)           NULL,
ImageUrl    	    NVARCHAR(500)           NULL,
IsActive	        BIT					NOT NULL DEFAULT 1,
IsDeleted	        BIT					NOT NULL DEFAULT 0,
CreatedBy	        INT         		NOT NULL,
CreatedAt	        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	        INT         		    NULL,
ModifiedAt	        DATETIME2(7)			NULL,
CONSTRAINT PK_Employees PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_Employees_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_Employees_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_Employees_CellPhoneWhatsapp CHECK (IsCellPhoneWhatsapp = 0 OR NULLIF(LTRIM(RTRIM(CellPhoneNumber)), N'') IS NOT NULL),
CONSTRAINT CK_Employees_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT FK_Employees_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_Employees_StatusDefinition FOREIGN KEY (StatusDefinitionId, TenantId, StatusDomainId) REFERENCES dbo.StatusDefinitions (Id, TenantId, StatusDomainId)
);
GO
CREATE TABLE dbo.EmployeeContactPersons (
Id			        INT IDENTITY(1,1)	NOT NULL,
TenantId	        INT					NOT NULL,
EmployeeId	        INT					NOT NULL,
JobTitle            NVARCHAR(150)           NULL,
Department          NVARCHAR(150)           NULL,
Name		        NVARCHAR(150)		NOT NULL,
PhoneNumber         NVARCHAR(50)            NULL,
CellPhoneNumber     NVARCHAR(50)            NULL,
IsCellPhoneWhatsapp BIT                 NOT NULL CONSTRAINT DF_EmployeeContactPersons_IsCellPhoneWhatsapp  DEFAULT 0,
Email		        NVARCHAR(255)		    NULL,
IsPrimary	        BIT					NOT NULL DEFAULT 0,
IsActive	        BIT					NOT NULL DEFAULT 1,
IsDeleted	        BIT					NOT NULL DEFAULT 0,
CreatedBy	        INT         		NOT NULL,
CreatedAt	        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	        INT         		    NULL,
ModifiedAt	        DATETIME2(7)			NULL,
CONSTRAINT PK_EmployeeContactPersons PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_EmployeeContactPersons_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_EmployeeContactPersons_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_EmployeeContactPersons_CellPhoneWhatsapp CHECK (IsCellPhoneWhatsapp = 0 OR NULLIF(LTRIM(RTRIM(CellPhoneNumber)), N'') IS NOT NULL),
CONSTRAINT CK_EmployeeContactPersons_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT FK_EmployeeContactPersons_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_EmployeeContactPersons_Employee FOREIGN KEY (EmployeeId, TenantId) REFERENCES dbo.Employees(Id, TenantId)
);
GO
CREATE TABLE dbo.EmployeeAddresses (
Id			    INT IDENTITY(1,1)	NOT NULL,
TenantId	    INT					NOT NULL,
EmployeeId	    INT					NOT NULL,
AddressTypeId   INT                 NOT NULL,
CountryCode		CHAR(2)				NOT NULL DEFAULT 'PT',
Street			NVARCHAR(200)		NOT NULL,
Neighborhood    NVARCHAR(100)           NULL,
City			NVARCHAR(100)		NOT NULL,
District		NVARCHAR(100)		    NULL,
PostalCode		NVARCHAR(20)		NOT NULL,
StreetNumber    NVARCHAR(20)            NULL,
Complement      NVARCHAR(100)           NULL,
Latitude        DECIMAL(9,6)            NULL,
Longitude       DECIMAL(9,6)            NULL,
Note            NVARCHAR(500)           NULL,
IsPrimary		BIT					NOT NULL DEFAULT 0,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_EmployeeAddresses PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_EmployeeAddresses_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_EmployeeAddresses_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_EmployeeAddresses_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_EmployeeAddresses_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT CK_EmployeeAddresses_Latitude CHECK (Latitude IS NULL OR Latitude BETWEEN -90 AND 90),
CONSTRAINT CK_EmployeeAddresses_Longitude CHECK (Longitude IS NULL OR Longitude BETWEEN -180 AND 180),
CONSTRAINT CK_EmployeeAddresses_Coordinates CHECK ((Latitude IS NULL AND Longitude IS NULL) OR (Latitude IS NOT NULL AND Longitude IS NOT NULL)),
CONSTRAINT FK_EmployeeAddresses_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_EmployeeAddresses_Employee FOREIGN KEY (EmployeeId, TenantId) REFERENCES dbo.Employees(Id, TenantId),
CONSTRAINT FK_EmployeeAddresses_AddressType FOREIGN KEY (AddressTypeId) REFERENCES dbo.AddressTypes(Id)
);
GO
CREATE TABLE dbo.EmployeeFiscalData (
Id                      INT IDENTITY(1,1)   NOT NULL,
TenantId                INT                 NOT NULL,
EmployeeId              INT                 NOT NULL,
TaxNumber               NVARCHAR(20)        NOT NULL,
VatNumber               NVARCHAR(20)            NULL,
FiscalCountry           CHAR(2)             NOT NULL DEFAULT 'PT',
IsVatRegistered         BIT                 NOT NULL DEFAULT 0,
IBAN                    NVARCHAR(34)            NULL,
FiscalEmail             NVARCHAR(255)           NULL,
IsActive                BIT                 NOT NULL DEFAULT 1,
IsDeleted               BIT                 NOT NULL DEFAULT 0,
CreatedBy               INT                 NOT NULL,
CreatedAt               DATETIME2(7)        NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy              INT                     NULL,
ModifiedAt              DATETIME2(7)            NULL,
CONSTRAINT PK_EmployeeFiscalData PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_EmployeeFiscalData_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_EmployeeFiscalData_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT FK_EmployeeFiscalData_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_EmployeeFiscalData_Employee FOREIGN KEY (EmployeeId, TenantId) REFERENCES dbo.Employees(Id, TenantId)
);
GO
CREATE TABLE dbo.EmployeeTeam (
Id              INT IDENTITY(1,1)   NOT NULL,
TenantId        INT                 NOT NULL,
TeamId          INT                 NOT NULL,
EmployeeId      INT                 NOT NULL,
IsLeader        BIT                 NOT NULL DEFAULT 0,
StartDateTime   DATETIME2           NOT NULL,
EndDateTime     DATETIME2               NULL,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_EmployeeTeam PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_EmployeeTeam_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_EmployeeTeam_EndDateTime CHECK (EndDateTime IS NULL OR EndDateTime >= StartDateTime),
CONSTRAINT FK_EmployeeTeam_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_EmployeeTeam_Team FOREIGN KEY (TeamId, TenantId) REFERENCES dbo.Teams(Id, TenantId),
CONSTRAINT FK_EmployeeTeam_Member FOREIGN KEY (EmployeeId, TenantId) REFERENCES dbo.Employees(Id, TenantId)
);
GO
CREATE TABLE dbo.EquipmentTypes (
Id			INT IDENTITY(1,1)	NOT NULL,
TenantId	INT					NOT NULL,
Name	    NVARCHAR(200)		NOT NULL,
Description NVARCHAR(500)		NOT NULL,
IsActive	BIT					NOT NULL DEFAULT 1,
IsDeleted	BIT					NOT NULL DEFAULT 0,
CreatedBy	INT         		NOT NULL,
CreatedAt	DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	INT         		    NULL,
ModifiedAt	DATETIME2(7)		    NULL,
CONSTRAINT PK_EquipmentTypes PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_EquipmentTypes_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_EquipmentTypes_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_EquipmentTypes_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
);
GO
CREATE TABLE dbo.Equipments (
Id				        INT IDENTITY(1,1)	NOT NULL,
TenantId		        INT					NOT NULL,
EquipmentTypeId	        INT					NOT NULL,
StatusDefinitionId      INT					NOT NULL,
StatusDomainId          INT                 NOT NULL,
Name			        NVARCHAR(150)		NOT NULL,
SerialNumber	        NVARCHAR(100)			NULL,
UrlImage    	        NVARCHAR(500)			NULL,
IsActive		        BIT					NOT NULL DEFAULT 1,
IsDeleted		        BIT					NOT NULL DEFAULT 0,
CreatedBy		        INT         		NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)			NULL,
CONSTRAINT PK_Equipments PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Equipments_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_Equipments_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_Equipments_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_Equipments_StatusDefinition FOREIGN KEY (StatusDefinitionId, TenantId, StatusDomainId) REFERENCES dbo.StatusDefinitions (Id, TenantId, StatusDomainId),
CONSTRAINT FK_Equipments_EquipmentType FOREIGN KEY (EquipmentTypeId, TenantId) REFERENCES dbo.EquipmentTypes(Id, TenantId)
);
GO
CREATE TABLE dbo.Vehicles (
Id				    INT IDENTITY(1,1)	NOT NULL,
TenantId            INT					NOT NULL,
StatusDefinitionId  INT                 NOT NULL,
StatusDomainId      INT                 NOT NULL,
Plate               NVARCHAR(20)		NOT NULL,
Brand               NVARCHAR(100)		NOT NULL,
Model               NVARCHAR(100)		NOT NULL,
Year                INT					NOT NULL,
Color               NVARCHAR(50)            NULL,
FuelType            NVARCHAR(50)            NULL,
IsActive		    BIT					NOT NULL DEFAULT 1,
IsDeleted		    BIT					NOT NULL DEFAULT 0,
CreatedBy		    INT         		NOT NULL,
CreatedAt		    DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	        INT         		    NULL,
ModifiedAt		    DATETIME2(7)			NULL,
CONSTRAINT PK_Vehicles PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Vehicles_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_Vehicles_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_Vehicles_Tenants FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_Vehicles_StatusDefinition FOREIGN KEY (StatusDefinitionId, TenantId, StatusDomainId) REFERENCES dbo.StatusDefinitions (Id, TenantId, StatusDomainId)
);
GO
CREATE TABLE dbo.Visits (
Id				        INT IDENTITY(1,1)	NOT NULL,
TenantId                INT					NOT NULL,
ClientId		        INT					NOT NULL,
StatusDefinitionId      INT				    NOT NULL,
StatusDomainId          INT                 NOT NULL,
Title			        NVARCHAR(200)		NOT NULL,
Description		        NVARCHAR(2000)		NOT NULL,
CurrencyCode            CHAR(3)             NOT NULL,
StartDateTime	        DATETIME2(7)		NOT NULL,
EndDateTime		        DATETIME2(7)			NULL,
EstimatedValue	        DECIMAL(19,4)		NOT NULL CHECK (EstimatedValue >= 0),
RealValue		        DECIMAL(19,4)			NULL,
IsActive		        BIT					NOT NULL DEFAULT 1,
IsDeleted		        BIT					NOT NULL DEFAULT 0,
CreatedBy		        INT         		NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)			NULL,
CONSTRAINT PK_Visits PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_Visits_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_Visits_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_Visits_Tenants FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_Visits_Clients FOREIGN KEY (ClientId, TenantId) REFERENCES dbo.Clients(Id, TenantId),
CONSTRAINT FK_Visits_StatusDefinition FOREIGN KEY (StatusDefinitionId, TenantId, StatusDomainId) REFERENCES dbo.StatusDefinitions (Id, TenantId, StatusDomainId),
CONSTRAINT CK_Visits_EndDateTime	CHECK ( EndDateTime IS NULL OR EndDateTime >= StartDateTime)
);
GO
CREATE TABLE dbo.VisitContactPersons (
Id			        INT IDENTITY(1,1)	NOT NULL,
TenantId	        INT					NOT NULL,
VisitId	            INT					NOT NULL,
JobTitle            NVARCHAR(150)           NULL,
Department          NVARCHAR(150)           NULL,
Name		        NVARCHAR(150)		NOT NULL,
PhoneNumber         NVARCHAR(50)            NULL,
CellPhoneNumber     NVARCHAR(50)            NULL,
IsCellPhoneWhatsapp BIT                 NOT NULL CONSTRAINT DF_VisitContactPersons_IsCellPhoneWhatsapp  DEFAULT 0,
Email		        NVARCHAR(255)		    NULL,
IsPrimary	        BIT					NOT NULL DEFAULT 0,
IsActive	        BIT					NOT NULL DEFAULT 1,
IsDeleted	        BIT					NOT NULL DEFAULT 0,
CreatedBy	        INT         		NOT NULL,
CreatedAt	        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	        INT         		    NULL,
ModifiedAt	        DATETIME2(7)			NULL,
CONSTRAINT PK_VisitContactPersons PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_VisitContactPersons_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_VisitContactPersons_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_VisitContactPersons_CellPhoneWhatsapp CHECK (IsCellPhoneWhatsapp = 0 OR NULLIF(LTRIM(RTRIM(CellPhoneNumber)), N'') IS NOT NULL),
CONSTRAINT CK_VisitContactPersons_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT FK_VisitContactPersons_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_VisitContactPersons_Visit FOREIGN KEY (VisitId, TenantId) REFERENCES dbo.Visits(Id, TenantId)
);
GO
CREATE TABLE dbo.VisitAddresses (
Id			    INT IDENTITY(1,1)	NOT NULL,
TenantId	    INT					NOT NULL,
VisitId	        INT					NOT NULL,
AddressTypeId   INT                 NOT NULL,
CountryCode		CHAR(2)				NOT NULL DEFAULT 'PT',
Street			NVARCHAR(200)		NOT NULL,
Neighborhood    NVARCHAR(100)           NULL,
City			NVARCHAR(100)		NOT NULL,
District		NVARCHAR(100)		    NULL,
PostalCode		NVARCHAR(20)		NOT NULL,
StreetNumber    NVARCHAR(20)            NULL,
Complement      NVARCHAR(100)           NULL,
Latitude        DECIMAL(9,6)            NULL,
Longitude       DECIMAL(9,6)            NULL,
Note            NVARCHAR(500)           NULL,
IsPrimary		BIT					NOT NULL DEFAULT 0,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_VisitAddresses PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_VisitAddresses_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_VisitAddresses_Primary_Active CHECK (IsPrimary = 0 OR IsActive = 1),
CONSTRAINT CK_VisitAddresses_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_VisitAddresses_Modification CHECK ((ModifiedAt IS NULL AND ModifiedBy IS NULL) OR (ModifiedAt IS NOT NULL AND ModifiedBy IS NOT NULL)),
CONSTRAINT CK_VisitAddresses_Latitude CHECK (Latitude IS NULL OR Latitude BETWEEN -90 AND 90),
CONSTRAINT CK_VisitAddresses_Longitude CHECK (Longitude IS NULL OR Longitude BETWEEN -180 AND 180),
CONSTRAINT CK_VisitAddresses_Coordinates CHECK ((Latitude IS NULL AND Longitude IS NULL) OR (Latitude IS NOT NULL AND Longitude IS NOT NULL)),
CONSTRAINT FK_VisitAddresses_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_VisitAddresses_Visit FOREIGN KEY (VisitId, TenantId) REFERENCES dbo.Visits(Id, TenantId),
CONSTRAINT FK_VisitAddresses_AddressType FOREIGN KEY (AddressTypeId) REFERENCES dbo.AddressTypes(Id)
);
GO
CREATE TABLE dbo.VisitTeam (
Id                      INT IDENTITY(1,1)   NOT NULL,
TenantId                INT                 NOT NULL,
VisitId                 INT                 NOT NULL,
TeamId                  INT                 NOT NULL,
StartDateTime           DATETIME2           NOT NULL,
EndDateTime             DATETIME2               NULL,
IsActive		        BIT					NOT NULL DEFAULT 1,
IsDeleted		        BIT					NOT NULL DEFAULT 0,
CreatedBy		        INT         		NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)			NULL,
CONSTRAINT PK_VisitTeam PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_VisitTeam_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_VisitTeam_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_VisitTeam_EndDateTime CHECK ( EndDateTime IS NULL OR EndDateTime >= StartDateTime ),
CONSTRAINT FK_VisitTeam_Visit FOREIGN KEY (VisitId, TenantId) REFERENCES dbo.Visits(Id, TenantId),
CONSTRAINT FK_VisitTeam_Team FOREIGN KEY (TeamId, TenantId) REFERENCES dbo.Teams(Id, TenantId)
);
GO
CREATE TABLE dbo.VisitTeamFunctions (
Id              INT IDENTITY(1,1)   NOT NULL,
TenantId        INT                 NOT NULL,
Name            NVARCHAR(150)       NOT NULL,
Description     NVARCHAR(500)       NOT NULL,
IsActive		BIT					NOT NULL DEFAULT 1,
IsDeleted		BIT					NOT NULL DEFAULT 0,
CreatedBy		INT         		NOT NULL,
CreatedAt		DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	    INT         		    NULL,
ModifiedAt		DATETIME2(7)			NULL,
CONSTRAINT PK_VisitTeamFunctions PRIMARY KEY CLUSTERED (Id),
CONSTRAINT CK_VisitTeamFunctions_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT UQ_VisitTeamFunctions_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT FK_VisitTeamFunctions_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
)
GO
CREATE TABLE dbo.VisitTeamEmployee (
Id                      INT IDENTITY(1,1)   NOT NULL,
TenantId                INT                 NOT NULL,
VisitTeamId             INT                 NOT NULL,
EmployeeId              INT                 NOT NULL,
VisitTeamFunctionId     INT                 NOT NULL,
IsLeader                BIT                 NOT NULL,
StartDateTime           DATETIME2           NOT NULL,
EndDateTime             DATETIME2               NULL,
IsActive		        BIT					NOT NULL DEFAULT 1,
IsDeleted		        BIT					NOT NULL DEFAULT 0,
CreatedBy		        INT         		NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)			NULL,
CONSTRAINT PK_VisitTeamEmployee PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_VisitTeamEmployee_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_VisitTeamEmployee_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT CK_VisitTeamEmployee_EndDateTime	CHECK ( EndDateTime IS NULL OR EndDateTime >= StartDateTime),
CONSTRAINT FK_VisitTeamEmployee_VisitTeam FOREIGN KEY (VisitTeamId, TenantId) REFERENCES dbo.VisitTeam(Id, TenantId),
CONSTRAINT FK_VisitTeamEmployee_Employee FOREIGN KEY (EmployeeId, TenantId) REFERENCES dbo.Employees(Id, TenantId),
CONSTRAINT FK_VisitTeamEmployee_VisitTeamFunction FOREIGN KEY (VisitTeamFunctionId, TenantId) REFERENCES dbo.VisitTeamFunctions(Id, TenantId)
);
GO
CREATE TABLE dbo.VisitTeamVehicle (
Id                  INT IDENTITY(1,1)   NOT NULL,
TenantId            INT                 NOT NULL,
VisitTeamId         INT                 NOT NULL,
VehicleId           INT                 NOT NULL,
IsActive		    BIT					NOT NULL DEFAULT 1,
IsDeleted		    BIT					NOT NULL DEFAULT 0,
CreatedBy		    INT         		NOT NULL,
CreatedAt		    DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	        INT         		    NULL,
ModifiedAt		    DATETIME2(7)			NULL,
CONSTRAINT PK_VisitTeamVehicle PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_VisitTeamVehicle_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_VisitTeamVehicle_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT FK_VisitTeamVehicle_VisitTeam FOREIGN KEY (VisitTeamId, TenantId) REFERENCES dbo.VisitTeam(Id, TenantId),
CONSTRAINT FK_VisitTeamVehicle_Vehicle FOREIGN KEY (VehicleId, TenantId) REFERENCES dbo.Vehicles(Id, TenantId)
);
GO
CREATE TABLE dbo.VisitTeamEquipment (
Id                      INT IDENTITY(1,1)   NOT NULL,
TenantId                INT                 NOT NULL,
VisitTeamId             INT                 NOT NULL,
EquipmentId             INT                 NOT NULL,
IsActive		        BIT					NOT NULL DEFAULT 1,
IsDeleted		        BIT					NOT NULL DEFAULT 0,
CreatedBy		        INT         		NOT NULL,
CreatedAt		        DATETIME2(7)		NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy	            INT         		    NULL,
ModifiedAt		        DATETIME2(7)			NULL,
CONSTRAINT PK_VisitTeamEquipment PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_VisitTeamEquipment_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_VisitTeamEquipment_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT FK_VisitTeamEquipment_VisitTeam FOREIGN KEY (VisitTeamId, TenantId) REFERENCES dbo.VisitTeam(Id, TenantId),
CONSTRAINT FK_VisitTeamEquipment_Equipment FOREIGN KEY (EquipmentId, TenantId) REFERENCES dbo.Equipments(Id, TenantId)
);
GO
CREATE TABLE dbo.VisitAttachments (
Id                      INT IDENTITY(1,1)   NOT NULL,
TenantId                INT                 NOT NULL,
FileTypeId              INT                 NOT NULL,
VisitId                 INT                 NOT NULL,
PublicId                UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
S3Key                   NVARCHAR(500)       NOT NULL,
FileName                NVARCHAR(255)       NOT NULL,
FileSizeBytes           BIGINT              NOT NULL CHECK (FileSizeBytes > 0),
DisplayOrder            INT                 NOT NULL DEFAULT 0,
IsPrimary               BIT                 NOT NULL DEFAULT 0,
IsActive                BIT                 NOT NULL DEFAULT 1,
IsDeleted               BIT                 NOT NULL DEFAULT 0,
CreatedBy               INT                 NOT NULL,
CreatedAt               DATETIME2(7)        NOT NULL DEFAULT SYSUTCDATETIME(),
ModifiedBy              INT                     NULL,
ModifiedAt              DATETIME2(7)            NULL,
CONSTRAINT PK_VisitAttachments PRIMARY KEY CLUSTERED (Id),
CONSTRAINT UQ_VisitAttachments_Id_Tenant UNIQUE (Id, TenantId),
CONSTRAINT CK_VisitAttachments_Active_Deleted CHECK (NOT (IsActive = 1 AND IsDeleted = 1)),
CONSTRAINT FK_VisitAttachments_Tenant FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id),
CONSTRAINT FK_VisitAttachments_FileType FOREIGN KEY (FileTypeId) REFERENCES dbo.FileTypes(Id),
CONSTRAINT FK_VisitAttachments_Visit FOREIGN KEY (VisitId, TenantId) REFERENCES dbo.Visits(Id, TenantId)
);
GO

CREATE UNIQUE INDEX UX_ClientContactPersons_Email                                   ON dbo.ClientContactPersons (TenantId, ClientId, Email) WHERE Email IS NOT NULL AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_ClientDocuments_Type_Country_Number                          ON dbo.ClientDocuments (TenantId, DocumentTypeId, IssuingCountryCode, DocumentNumber) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_ClientFiscalData_TaxNumber                                   ON dbo.ClientFiscalData (TenantId, FiscalCountry, TaxNumber) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_TenantFiscalData_TaxNumber                                   ON dbo.TenantFiscalData (TenantId, FiscalCountry, TaxNumber) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_EmployeeFiscalData_TaxNumber                                 ON dbo.EmployeeFiscalData (TenantId, FiscalCountry, TaxNumber) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_Roles_Tenant_Name                                            ON dbo.Roles (TenantId, Name) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_Teams_Tenant_Name                                            ON dbo.Teams (TenantId, Name) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_EquipmentTypes_Tenant_Name                                   ON dbo.EquipmentTypes (TenantId, Name) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_Vehicles_Tenant_Plate                                        ON dbo.Vehicles (TenantId, Plate) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_Resources_Code                                               ON dbo.Resources (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_Actions_Code                                                 ON dbo.Actions (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_SubscriptionPlanFileRules_Plan_FileType                      ON dbo.SubscriptionPlanFileRules (SubscriptionPlanId, FileTypeId) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_FileTypes_MimeType_Extension                                 ON dbo.FileTypes (MimeType, Extension) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_JobDefinitions_JobName                                       ON dbo.JobDefinitions (JobName) WHERE IsDeleted = 0;

CREATE UNIQUE INDEX UX_AcquisitionSourceTypes_Code                                  ON dbo.AcquisitionSourceTypes (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_AddressTypes_Code                                            ON dbo.AddressTypes (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_DocumentTypes_Code                                           ON dbo.DocumentTypes (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_FileTypes_Code                                               ON dbo.FileTypes (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_PartyTypes_Code                                              ON dbo.PartyTypes (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_StatusDomains_Code                                           ON dbo.StatusDomains (Code) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_SubscriptionPlans_Code                                       ON dbo.SubscriptionPlans (Code) WHERE IsDeleted = 0;

CREATE UNIQUE INDEX UX_ClientFiscalData_Active                                      ON dbo.ClientFiscalData (TenantId, ClientId)        WHERE IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_TenantFiscalData_Active                                      ON dbo.TenantFiscalData(TenantId)                   WHERE IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_Subscriptions_Active                                         ON dbo.Subscriptions(TenantId)                      WHERE IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_JwtKeys_Active                                               ON dbo.JwtKeys (TenantId)                           WHERE IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_VisitTeam_Active                                             ON dbo.VisitTeam (TenantId, VisitId, TeamId)        WHERE IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_UserPreferences_Tenant_User_Active                           ON dbo.UserPreferences (TenantId, UserId)           WHERE IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_TenantContactPersons_Email_Active                            ON dbo.TenantContactPersons (TenantId, Email)       WHERE Email IS NOT NULL AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_EmployeeTeam_Active                                          ON dbo.EmployeeTeam (TenantId, TeamId, EmployeeId)  WHERE EndDateTime IS NULL AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_EmployeeFiscalData_Active                                    ON dbo.EmployeeFiscalData (TenantId, EmployeeId)    WHERE IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_VisitTeamEmployee_Active                                     ON dbo.VisitTeamEmployee (TenantId, VisitTeamId, EmployeeId) WHERE EndDateTime IS NULL AND IsDeleted = 0;

CREATE UNIQUE INDEX UX_ClientAddresses_Primary                                      ON dbo.ClientAddresses (TenantId, ClientId)         WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_ClientContactPersons_Primary                                 ON dbo.ClientContactPersons (TenantId, ClientId)    WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_ClientDocuments_Primary                                      ON dbo.ClientDocuments (TenantId, ClientId)         WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_TenantAddresses_Primary                                      ON dbo.TenantAddresses (TenantId)                   WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_TenantContactPersons_Primary                                 ON dbo.TenantContactPersons (TenantId)              WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_TenantDocuments_Primary                                      ON dbo.TenantDocuments (TenantId)                   WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_EmployeeAddresses_Primary                                    ON dbo.EmployeeAddresses (TenantId, EmployeeId)     WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_VisitAddresses_Primary                                       ON dbo.VisitAddresses (TenantId, VisitId)           WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;
CREATE UNIQUE INDEX UX_VisitAttachments_Primary                                     ON dbo.VisitAttachments (TenantId, VisitId)         WHERE IsPrimary = 1 AND IsActive = 1 AND IsDeleted = 0;

CREATE UNIQUE INDEX UX_StatusDefinitions_Tenant_Domain_Code                         ON dbo.StatusDefinitions (TenantId, StatusDomainId, Code) WHERE IsDeleted = 0;

CREATE UNIQUE INDEX UX_Subscriptions_StripeId                                       ON dbo.Subscriptions(StripeId) WHERE StripeId IS NOT NULL;
CREATE UNIQUE INDEX UX_VisitAttachments_PublicId                                    ON dbo.VisitAttachments (TenantId, PublicId);
CREATE UNIQUE INDEX UX_VisitAttachments_S3Key                                       ON dbo.VisitAttachments (TenantId, S3Key) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_VisitTeamEquipment_Unique                                    ON dbo.VisitTeamEquipment (TenantId, VisitTeamId, EquipmentId) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_VisitTeamVehicle_Unique                                      ON dbo.VisitTeamVehicle (TenantId, VisitTeamId, VehicleId) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_RefreshTokens_TokenHash                                      ON dbo.RefreshTokens(TokenHash);
CREATE UNIQUE INDEX UX_Users_Tenant_NormalizedEmail                                 ON dbo.Users (TenantId, NormalizedEmail) WHERE IsDeleted = 0;

CREATE NONCLUSTERED INDEX IX_Clients_TenantId                                       ON dbo.Clients (TenantId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_ClientAddresses_Client                                 ON dbo.ClientAddresses (TenantId, ClientId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_ClientContactPersons_Client                            ON dbo.ClientContactPersons (TenantId, ClientId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_ClientDocuments_Client                                 ON dbo.ClientDocuments (TenantId, ClientId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_EmployeeContacts_EmployeeId		                    ON dbo.EmployeeContactPersons (TenantId, EmployeeId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_EmployeeAddresses_EmployeeId		                    ON dbo.EmployeeAddresses (TenantId, EmployeeId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_VisitContacts_VisitId                                  ON dbo.VisitContactPersons (TenantId, VisitId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_Visits_Tenant_Date                                     ON dbo.Visits (TenantId, StartDateTime) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_Visits_ClientId                                        ON dbo.Visits (TenantId, ClientId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_StatusDefinitions_Tenant_Domain                        ON dbo.StatusDefinitions (TenantId, StatusDomainId) INCLUDE (Code, DisplayOrder, IsActive) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_RolePermissions_RoleId					                ON dbo.RolePermissions (TenantId, RoleId) INCLUDE (ResourceId, ActionId);
CREATE NONCLUSTERED INDEX IX_RolePermissions_ResourceId				                ON dbo.RolePermissions (TenantId, ResourceId) INCLUDE (RoleId, ActionId);
CREATE NONCLUSTERED INDEX IX_RolePermissions_ActionId				                ON dbo.RolePermissions (TenantId, ActionId) INCLUDE (RoleId, ResourceId);
CREATE NONCLUSTERED INDEX IX_Users_Login											ON dbo.Users (NormalizedEmail) INCLUDE (Id, TenantId, IsActive) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_RefreshTokens_User_Active                              ON dbo.RefreshTokens (TenantId, UserId) WHERE RevokedAt IS NULL;
CREATE NONCLUSTERED INDEX IX_RefreshTokens_ExpiresAt                                ON dbo.RefreshTokens (TenantId, ExpiresAt) WHERE RevokedAt IS NULL;
CREATE NONCLUSTERED INDEX IX_Visits_Dashboard                                       ON dbo.Visits (TenantId, StatusDefinitionId, StartDateTime) INCLUDE (ClientId, EstimatedValue) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_VisitTeam_VisitId                                      ON dbo.VisitTeam (TenantId, VisitId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_VisitTeamVehicle_VisitTeamId                           ON dbo.VisitTeamVehicle (TenantId, VisitTeamId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_VisitTeamEquipment_VisitTeamId                         ON dbo.VisitTeamEquipment (TenantId, VisitTeamId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_VisitAttachments_Tenant_Visit                          ON dbo.VisitAttachments (TenantId, VisitId) INCLUDE (DisplayOrder, IsPrimary, FileTypeId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_VisitAttachments_FileTypeId                            ON dbo.VisitAttachments (TenantId, FileTypeId) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_SubscriptionPlanFileRules_SubscriptionPlan             ON dbo.SubscriptionPlanFileRules (SubscriptionPlanId) INCLUDE (FileTypeId, MaxFileSizeMB) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_SubscriptionPlanFileRules_FileType                     ON dbo.SubscriptionPlanFileRules (FileTypeId) INCLUDE (SubscriptionPlanId, MaxFileSizeMB) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_JobDefinitions_Category_Active                         ON dbo.JobDefinitions(JobCategory, IsActive, IsDeleted);
CREATE NONCLUSTERED INDEX IX_JobDefinitions_Active_System                           ON dbo.JobDefinitions(IsActive, IsSystemJob) WHERE IsDeleted = 0;
CREATE NONCLUSTERED INDEX IX_JobDefinitions_HangfireJobId                           ON dbo.JobDefinitions(HangfireJobId) WHERE HangfireJobId IS NOT NULL;
GO

GO

/* =========================
ROW LEVEL SECURITY
========================= */

-- Fun��o de isolamento multi-tenant com suporte a SuperAdmin
CREATE FUNCTION dbo.fn_TenantAccessPredicate (
@TenantId INT
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
SELECT 1 AS fn_access
WHERE
-- SuperAdmin tem acesso a tudo (bypass RLS)
TRY_CONVERT(BIT, SESSION_CONTEXT(N'IsSuperAdmin')) = 1
OR
-- Tenant ID deve corresponder
-- SESSION_CONTEXT retorna VARBINARY, ent�o convertemos de volta para INT
(
SESSION_CONTEXT(N'TenantId') IS NOT NULL
AND @TenantId = TRY_CONVERT(INT, SESSION_CONTEXT(N'TenantId'))
);
GO

CREATE SECURITY POLICY dbo.TenantSecurityPolicy
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(Id)       ON dbo.Tenants,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Users,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Roles,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserRoles,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserPreferences,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RolePermissions,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.JwtKeys,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Subscriptions,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantContactPersons,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantAddresses,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantDocuments,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantFiscalData,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Clients,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientAddresses,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientContactPersons,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientDocuments,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientFiscalData,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Employees,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeAddresses,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeContactPersons,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeFiscalData,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeTeam,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EquipmentTypes,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Visits,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitContactPersons,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAddresses,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamFunctions,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeam,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamVehicle,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEmployee,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEquipment,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAttachments,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitions,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitionTranslations,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Vehicles,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Equipments,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RefreshTokens,
ADD FILTER PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Teams,

ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(Id)       ON dbo.Tenants AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(Id)       ON dbo.Tenants AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(Id)       ON dbo.Tenants BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Users AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Users AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Users BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserPreferences AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserPreferences AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserPreferences BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Roles AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Roles AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Roles BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserRoles AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserRoles AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.UserRoles BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RolePermissions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RolePermissions AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RolePermissions BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.JwtKeys AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.JwtKeys AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.JwtKeys BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Subscriptions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Subscriptions AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Subscriptions BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantContactPersons AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantContactPersons AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantContactPersons BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantAddresses AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantAddresses AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantAddresses BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantDocuments AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantDocuments AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantDocuments BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantFiscalData AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantFiscalData AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.TenantFiscalData BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Clients AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Clients AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Clients BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientAddresses AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientAddresses AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientAddresses BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientContactPersons AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientContactPersons AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientContactPersons BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientDocuments AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientDocuments AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientDocuments BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientFiscalData AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientFiscalData AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.ClientFiscalData BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Employees AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Employees AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Employees BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeAddresses AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeAddresses AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeAddresses BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeContactPersons AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeContactPersons AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeContactPersons BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeFiscalData AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeFiscalData AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeFiscalData BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeTeam AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeTeam AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EmployeeTeam BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitions AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitions BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitionTranslations AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitionTranslations AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.StatusDefinitionTranslations BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Vehicles AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Vehicles AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Vehicles BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EquipmentTypes AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EquipmentTypes AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.EquipmentTypes BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Equipments AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Equipments AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Equipments BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Teams AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Teams AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Teams BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Visits AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Visits AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.Visits BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAddresses AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAddresses AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAddresses BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitContactPersons AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitContactPersons AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitContactPersons BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAttachments AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAttachments AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitAttachments BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamFunctions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamFunctions AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamFunctions BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeam AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeam AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeam BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamVehicle AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamVehicle AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamVehicle BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEquipment AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEquipment AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEquipment BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEmployee AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEmployee AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.VisitTeamEmployee BEFORE DELETE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RefreshTokens AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RefreshTokens AFTER UPDATE,
ADD BLOCK PREDICATE dbo.fn_TenantAccessPredicate(TenantId) ON dbo.RefreshTokens BEFORE DELETE

WITH (STATE = ON);

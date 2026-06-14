/**
 * Lista de países europeus + Brasil + Estados Unidos
 * Usada para o campo "País Fiscal" no formulário de dados fiscais de clientes
 * Cada entrada contém o código ISO 3166-1 alpha-2 (CHAR(2)) e o nome do país
 */

export interface CountryOption {
  code: string;
  name: string;
}

export const EUROPEAN_COUNTRIES_PLUS_BR_US: CountryOption[] = [
  // Europa
  { code: "AL", name: "Albânia" },
  { code: "AD", name: "Andorra" },
  { code: "AT", name: "Áustria" },
  { code: "BY", name: "Bielorrússia" },
  { code: "BE", name: "Bélgica" },
  { code: "BA", name: "Bósnia e Herzegovina" },
  { code: "BG", name: "Bulgária" },
  { code: "HR", name: "Croácia" },
  { code: "CY", name: "Chipre" },
  { code: "CZ", name: "Chéquia" },
  { code: "DK", name: "Dinamarca" },
  { code: "EE", name: "Estónia" },
  { code: "FI", name: "Finlândia" },
  { code: "FR", name: "França" },
  { code: "DE", name: "Alemanha" },
  { code: "GR", name: "Grécia" },
  { code: "HU", name: "Hungria" },
  { code: "IE", name: "Irlanda" },
  { code: "IT", name: "Itália" },
  { code: "XK", name: "Kosovo" },
  { code: "LV", name: "Letónia" },
  { code: "LI", name: "Listenstaine" },
  { code: "LT", name: "Lituânia" },
  { code: "LU", name: "Luxemburgo" },
  { code: "MT", name: "Malta" },
  { code: "MD", name: "Moldávia" },
  { code: "MC", name: "Mónaco" },
  { code: "ME", name: "Montenegro" },
  { code: "NL", name: "Países Baixos" },
  { code: "MK", name: "Macedónia do Norte" },
  { code: "NO", name: "Noruega" },
  { code: "PL", name: "Polónia" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Roménia" },
  { code: "RU", name: "Rússia" },
  { code: "SM", name: "São Marinho" },
  { code: "RS", name: "Sérvia" },
  { code: "SK", name: "Eslováquia" },
  { code: "SI", name: "Eslovénia" },
  { code: "ES", name: "Espanha" },
  { code: "SE", name: "Suécia" },
  { code: "CH", name: "Suíça" },
  { code: "TR", name: "Turquia" },
  { code: "UA", name: "Ucrânia" },
  { code: "GB", name: "Reino Unido" },
  { code: "VA", name: "Vaticano" },
  // Brasil
  { code: "BR", name: "Brasil" },
  // Estados Unidos
  { code: "US", name: "Estados Unidos" },
];

/**
 * Obtém o nome do país pelo código
 */
export function getCountryNameByCode(code: string): string | undefined {
  const country = EUROPEAN_COUNTRIES_PLUS_BR_US.find((c) => c.code === code);
  return country?.name;
}

/**
 * Obtém o código do país pelo nome
 */
export function getCountryCodeByName(name: string): string | undefined {
  const country = EUROPEAN_COUNTRIES_PLUS_BR_US.find((c) => c.name === name);
  return country?.code;
}
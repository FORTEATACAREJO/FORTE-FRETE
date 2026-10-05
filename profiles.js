export const PROFILE_OPTIONS = [
  {
    "value": "MASTER",
    "label": "Master"
  },
  {
    "value": "ADMINISTRADOR",
    "label": "Administrador"
  },
  {
    "value": "OPERADOR_GERAL",
    "label": "Operador geral"
  },
  {
    "value": "OPERADOR_PATIO",
    "label": "Operador de pátio"
  },
  {
    "value": "MOTORISTA",
    "label": "Motorista"
  },
  {
    "value": "VENDEDOR_EXTERNO",
    "label": "Vendedor externo"
  },
  {
    "value": "VENDEDOR_INTERNO",
    "label": "Vendedor interno"
  }
];
export const PROFILE_CODES = PROFILE_OPTIONS.map(x => x.value);
export const PROFILE_LABELS = Object.fromEntries(PROFILE_OPTIONS.map(x => [x.value,x.label]));
const aliases = {"ADMIN":"ADMINISTRADOR","ULTRA_ADMIN":"MASTER","OPERATOR":"OPERADOR_GERAL","FISCAL":"OPERADOR_GERAL","ACCOUNTANT":"OPERADOR_GERAL","AUDITOR":"OPERADOR_GERAL","CONSULTA":"OPERADOR_GERAL","VENDAS":"VENDEDOR_INTERNO","CAIXA":"VENDEDOR_INTERNO","CONFERENCIA":"OPERADOR_PATIO","FINANCEIRO":"OPERADOR_GERAL","AUXILIAR_N1":"OPERADOR_GERAL","AUXILIAR_N2":"OPERADOR_GERAL","MOTORISTA_ENTREGA":"MOTORISTA","CONFERÊNCIA":"OPERADOR_PATIO","VENDEDOR EXTERNO":"VENDEDOR_EXTERNO","VENDEDOR INTERNO":"VENDEDOR_INTERNO","OPERADOR DE PÁTIO":"OPERADOR_PATIO","PÁTIO / EMPILHADEIRA":"OPERADOR_PATIO","COMPRAS / FORNECEDOR":"OPERADOR_GERAL","LOGÍSTICA / EXPEDIÇÃO":"OPERADOR_GERAL","PERSONALIZADO":"OPERADOR_GERAL"};
export function normalizeProfile(value) { const v=String(value||"").trim().toUpperCase(); return PROFILE_CODES.includes(v)?v:aliases[v]||""; }
export function profileOptionsFor(actor) { return PROFILE_OPTIONS.filter(x=>!["MASTER","ADMINISTRADOR"].includes(x.value)||normalizeProfile(actor)==="MASTER"); }


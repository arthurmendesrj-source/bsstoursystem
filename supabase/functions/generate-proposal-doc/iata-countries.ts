// IATA airport code → country name (PT) used to derive proposal title from flight legs.
// Add codes as needed; unknown codes are silently ignored.
export const IATA_COUNTRY: Record<string, string> = {
  // Brasil
  GRU: "Brasil", CGH: "Brasil", VCP: "Brasil", GIG: "Brasil", SDU: "Brasil",
  BSB: "Brasil", CNF: "Brasil", PLU: "Brasil", SSA: "Brasil", REC: "Brasil",
  FOR: "Brasil", NAT: "Brasil", MCZ: "Brasil", AJU: "Brasil", BPS: "Brasil",
  IOS: "Brasil", VIX: "Brasil", CWB: "Brasil", FLN: "Brasil", POA: "Brasil",
  IGU: "Brasil", CGB: "Brasil", CGR: "Brasil", MAO: "Brasil", BEL: "Brasil",
  SLZ: "Brasil", THE: "Brasil", PMW: "Brasil", GYN: "Brasil", LDB: "Brasil",
  MGF: "Brasil", FEN: "Brasil", JPA: "Brasil",
  // Argentina
  EZE: "Argentina", AEP: "Argentina", BRC: "Argentina", MDZ: "Argentina",
  USH: "Argentina", FTE: "Argentina", IGR: "Argentina", COR: "Argentina",
  SLA: "Argentina", BHI: "Argentina",
  // Chile
  SCL: "Chile", IPC: "Chile", PUQ: "Chile", CJC: "Chile", ZCO: "Chile",
  ANF: "Chile", LSC: "Chile", BBA: "Chile",
  // Peru
  LIM: "Peru", CUZ: "Peru", AQP: "Peru", IQT: "Peru", PIU: "Peru", TRU: "Peru",
  // Uruguai
  MVD: "Uruguai", PDP: "Uruguai",
  // Paraguai / Bolívia / Equador / Colômbia / Venezuela
  ASU: "Paraguai", VVI: "Bolívia", LPB: "Bolívia",
  UIO: "Equador", GYE: "Equador", GPS: "Equador",
  BOG: "Colômbia", MDE: "Colômbia", CTG: "Colômbia", CLO: "Colômbia",
  CCS: "Venezuela",
  // Caribe / América Central
  PUJ: "República Dominicana", SDQ: "República Dominicana",
  HAV: "Cuba", VRA: "Cuba",
  CUN: "México", MEX: "México", SJD: "México",
  PTY: "Panamá", SJO: "Costa Rica", LIR: "Costa Rica",
  // Estados Unidos / Canadá
  MIA: "EUA", JFK: "EUA", EWR: "EUA", LGA: "EUA", LAX: "EUA", SFO: "EUA",
  ORD: "EUA", DFW: "EUA", IAH: "EUA", ATL: "EUA", BOS: "EUA", MCO: "EUA",
  FLL: "EUA", LAS: "EUA", SEA: "EUA", IAD: "EUA", DCA: "EUA",
  YYZ: "Canadá", YUL: "Canadá", YVR: "Canadá",
  // Europa
  LIS: "Portugal", OPO: "Portugal", FNC: "Portugal",
  MAD: "Espanha", BCN: "Espanha", AGP: "Espanha", PMI: "Espanha",
  CDG: "França", ORY: "França", NCE: "França",
  LHR: "Reino Unido", LGW: "Reino Unido", MAN: "Reino Unido",
  FCO: "Itália", MXP: "Itália", LIN: "Itália", VCE: "Itália", NAP: "Itália",
  FRA: "Alemanha", MUC: "Alemanha", BER: "Alemanha",
  AMS: "Países Baixos", BRU: "Bélgica", ZRH: "Suíça", GVA: "Suíça",
  VIE: "Áustria", ATH: "Grécia", IST: "Turquia", SAW: "Turquia",
  PRG: "República Tcheca", BUD: "Hungria", WAW: "Polônia", CPH: "Dinamarca",
  ARN: "Suécia", OSL: "Noruega", HEL: "Finlândia", DUB: "Irlanda",
  SVO: "Rússia", DME: "Rússia", LED: "Rússia",
  // Oriente Médio / Ásia / África / Oceania
  DXB: "Emirados Árabes Unidos", AUH: "Emirados Árabes Unidos",
  DOH: "Catar", TLV: "Israel",
  HND: "Japão", NRT: "Japão", ICN: "Coreia do Sul",
  PEK: "China", PVG: "China", HKG: "Hong Kong",
  BKK: "Tailândia", SIN: "Singapura", KUL: "Malásia",
  DEL: "Índia", BOM: "Índia",
  JNB: "África do Sul", CPT: "África do Sul",
  CAI: "Egito", CMN: "Marrocos",
  SYD: "Austrália", MEL: "Austrália", AKL: "Nova Zelândia",
};

export function formatCountryList(countries: string[]): string {
  if (countries.length === 0) return "";
  if (countries.length === 1) return countries[0];
  if (countries.length === 2) return `${countries[0]} & ${countries[1]}`;
  return `${countries.slice(0, -1).join(", ")} & ${countries[countries.length - 1]}`;
}

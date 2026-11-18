export interface ContractLineRecord {
  contractId: string;
  itemCode: string;
  description: string;
  uom: string;
  rate: number;
}

export interface ContractRecord {
  contractId: string;
  supplierId: string;
  supplierName: string;
  startDate: Date;
  endDate: Date;
  valueCap: number;
  consumedValue: number;
  source: "register" | "pdf_extracted";
  lines: ContractLineRecord[];
}

/**
 * PDF-only signed contracts extracted from data/contracts/pdf/
 * (e.g. RC-2026-031 and RC-2026-033 signed after October 31 register cutoff)
 */
export const PDF_SIGNED_CONTRACTS: ContractRecord[] = [
  {
    contractId: "RC-2026-031",
    supplierId: "S021",
    supplierName: "Pneumatic Point",
    startDate: new Date("2026-11-15T00:00:00.000Z"),
    endDate: new Date("2027-11-14T23:59:59.999Z"),
    valueCap: 2000000,
    consumedValue: 0,
    source: "pdf_extracted",
    lines: [
      {
        contractId: "RC-2026-031",
        itemCode: "ITM-1036",
        description: "Pneumatic cylinder 50x100",
        uom: "NOS",
        rate: 3537.76,
      },
      {
        contractId: "RC-2026-031",
        itemCode: "ITM-1037",
        description: "Solenoid valve 5/2 1/4 inch",
        uom: "NOS",
        rate: 2439.01,
      },
      {
        contractId: "RC-2026-031",
        itemCode: "ITM-1039",
        description: "FRL unit 1/2 inch",
        uom: "NOS",
        rate: 2746.87,
      },
    ],
  },
  {
    contractId: "RC-2026-033",
    supplierId: "S035",
    supplierName: "Infoline Systems",
    startDate: new Date("2026-11-20T00:00:00.000Z"),
    endDate: new Date("2027-11-19T23:59:59.999Z"),
    valueCap: 5000000,
    consumedValue: 0,
    source: "pdf_extracted",
    lines: [
      {
        contractId: "RC-2026-033",
        itemCode: "ITM-1056",
        description: "Laptop i5 16GB 512GB",
        uom: "NOS",
        rate: 64654.36,
      },
      {
        contractId: "RC-2026-033",
        itemCode: "ITM-1057",
        description: "24 inch monitor",
        uom: "NOS",
        rate: 10689.51,
      },
    ],
  },
];

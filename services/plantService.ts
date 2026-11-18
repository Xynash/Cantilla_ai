import { connectToDatabase } from "@/lib/db";
import { Plant } from "@/models/Plant";

export async function listPlants() {
  try {
    await connectToDatabase();
    const plants = await Plant.find().sort({ plantCode: 1 }).lean();
    if (plants.length > 0) {
      return plants.map((p) => ({
        id: p._id.toString(),
        plantCode: p.plantCode,
        plantName: p.plantName,
        location: p.location || p.plantName,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));
    }
  } catch {
    // Fallback to bundled plants
  }

  const now = new Date().toISOString();
  return [
    {
      id: "CHK1",
      plantCode: "CHK1",
      plantName: "Chakan plant",
      location: "Chakan plant",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "PUN1",
      plantCode: "PUN1",
      plantName: "Pune - Bhosari plant",
      location: "Pune - Bhosari plant",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

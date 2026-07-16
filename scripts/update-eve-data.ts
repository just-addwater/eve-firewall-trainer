import { promises as fs } from "node:fs";
import path from "node:path";

interface RawType {
  typeID?: number;
  name?: string | { en?: string };
  mass?: number;
  radius?: number;
  capacity?: number;
  published?: boolean;
  dogmaAttributes?: Array<{ attributeID: number; value: number }>;
}

interface NormalizedRecord {
  id: number;
  name: string;
  mass: number | null;
  radius: number | null;
  source: "eve-sde";
  attributes: Record<string, number>;
}

const relevantNames = [
  "nestor",
  "smartbomb",
  "afterburner",
  "microwarpdrive",
  "cruise missile",
  "torpedo",
];

async function collectJsonFiles(
  directory: string,
  output: string[] = [],
): Promise<string[]> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectJsonFiles(fullPath, output);
    else if (entry.name.endsWith(".json")) output.push(fullPath);
  }
  return output.sort();
}

const displayName = (value: RawType["name"]): string =>
  typeof value === "string" ? value : (value?.en ?? "");

async function main(): Promise<void> {
  const source = process.argv[2];
  const destination = process.argv[3] ?? "src/data/eve-normalized.json";
  if (!source) {
    throw new Error(
      "Usage: npm run data:update -- <extracted-sde-directory> [output.json]",
    );
  }
  const sourcePath = path.resolve(source);
  const files = await collectJsonFiles(sourcePath);
  const records: NormalizedRecord[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      warnings.push(`Skipped invalid JSON: ${path.relative(sourcePath, file)}`);
      continue;
    }
    const values: RawType[] = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed as Record<string, RawType>).map(
          ([key, value]) => ({
            ...value,
            typeID: value.typeID ?? Number(key),
          }),
        );
    for (const value of values) {
      const name = displayName(value.name);
      if (
        !relevantNames.some((candidate) =>
          name.toLowerCase().includes(candidate),
        )
      )
        continue;
      if (!Number.isFinite(value.typeID)) {
        warnings.push(`Missing typeID for ${name || path.basename(file)}`);
        continue;
      }
      records.push({
        id: value.typeID!,
        name,
        mass: value.mass ?? null,
        radius: value.radius ?? null,
        source: "eve-sde",
        attributes: Object.fromEntries(
          (value.dogmaAttributes ?? [])
            .sort((first, second) => first.attributeID - second.attributeID)
            .map((attribute) => [
              String(attribute.attributeID),
              attribute.value,
            ]),
        ),
      });
    }
  }

  records.sort(
    (first, second) =>
      first.id - second.id || first.name.localeCompare(second.name),
  );
  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePath,
    recordCount: records.length,
    records,
    warnings,
  };
  await fs.mkdir(path.dirname(path.resolve(destination)), { recursive: true });
  await fs.writeFile(
    destination,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${records.length} relevant records to ${destination}`);
  for (const warning of warnings) console.warn(warning);
}

await main();

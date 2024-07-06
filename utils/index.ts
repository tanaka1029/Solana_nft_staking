import { Keypair } from "@solana/web3.js";
import fs from "fs";

export function getKeypair(secretKeyJsonPath: string): Keypair {
  const keyStr = fs.readFileSync(secretKeyJsonPath, "utf8");
  const privateKey = JSON.parse(keyStr);

  return Keypair.fromSecretKey(new Uint8Array(privateKey));
}

const privateKey = /\.(?:pem|key)$/i;

function isCredentialFile(file: string): boolean {
  const base = file.split("/").pop() ?? file;
  if (base === ".env") return true;
  if (base.startsWith(".env.") && base !== ".env.example") return true;
  if (/^(?:.*(?:credentials|secret|token).*|id_rsa)$/i.test(base)) return true;
  return false;
}

export async function securityGate(input: { files: string[] }): Promise<{ passed: boolean; findings: string[] }> {
  const findings: string[] = [];
  for (const file of input.files) {
    if (privateKey.test(file)) findings.push(`private key: ${file}`);
    if (isCredentialFile(file)) findings.push(`credential file: ${file}`);
  }
  return { passed: findings.length === 0, findings };
}

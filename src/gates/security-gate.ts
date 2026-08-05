const privateKey = /\.(?:pem|key)$/i;
const credentialFile = /^(?:\.env(?:\..*)?|.*(?:credentials|secret|token).*|id_rsa)$/i;

export async function securityGate(input: { files: string[] }): Promise<{ passed: boolean; findings: string[] }> {
  const findings: string[] = [];
  for (const file of input.files) {
    if (privateKey.test(file)) findings.push(`private key: ${file}`);
    if (credentialFile.test(file)) findings.push(`credential file: ${file}`);
  }
  return { passed: findings.length === 0, findings };
}

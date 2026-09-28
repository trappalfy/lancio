// Stub for optional deps pulled in by wallet SDKs (@coinbase/cdp-sdk → @x402/*) that Lancio never calls.
const unavailable = () => {
  throw new Error("x402 is not available in Lancio");
};
export const toClientEvmSigner = unavailable;
export const x402Client = unavailable;
export const registerExactEvmScheme = unavailable;
export const registerExactSvmScheme = unavailable;
export const UptoEvmScheme = unavailable;
export const ExactEvmScheme = unavailable;
export const ExactSvmScheme = unavailable;
const stub = {};
export default stub;

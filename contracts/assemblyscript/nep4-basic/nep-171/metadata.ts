@nearBindgen
export class NFTContractMetaData {
  spec: string // required, essentially a version like "nft-1.0.0"
  name: string // required, ex. "Mochi Rising — Digital Edition" or "Metaverse 3"
  symbol: string // required, ex. "MOCHI"
/*  base_uri: string | null // Centralized gateway known to have reliable access to decentralized storage assets referenced by `reference` or `media` URLs
  icon: string|null // Data URL
  reference: string|null // URL to a JSON file with more info
  reference_hash: string|null // Base64-encoded sha256 hash of JSON from reference field. Required if `reference` is included.*/
}

# Lancio

Token launchpad on Robinhood Chain (chainId 4663). One supply, one curve, the same rules for every token; liquidity locked forever at graduation.

- Packages: `contracts/` (Foundry), `packages/shared/` (math, ABIs, copy), `indexer/` (Ponder), `web/` (Next.js)

## Requirements
Node ≥ 22, pnpm 12, Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

## Run locally (mainnet fork, no real funds)
```bash
pnpm install
scripts/dev-chain.sh                 # terminal 1: anvil fork of Robinhood mainnet + Lancio contracts
pnpm --filter @lancio/indexer dev    # terminal 2: indexer on :42069
pnpm --filter @lancio/web dev        # terminal 3: site on :3000 (set NEXT_PUBLIC_USE_MOCKS=false in web/.env.local)
```
Wallet: add network RPC `http://127.0.0.1:8545`, chainId 4663, and import a test key printed in `/tmp/lancio-anvil.log`.
The public Robinhood RPC keeps only recent state, so a long-running fork eventually fails; set `RPC_URL_4663` to an Alchemy URL for longer sessions.

## Tests
```bash
cd contracts && forge test                               # unit, fuzz, adversarial review suites
forge test --match-contract ForkTest -vv                 # full cycle against real Uniswap v4 on a mainnet fork
pnpm --filter @lancio/shared test                        # curve math vectors (must match the contract to the wei)
```

## Mainnet deploy (owner only)
1. Deployer wallet with ~0.01 ETH on Robinhood Chain.
2. `cd contracts && PROTOCOL_OWNER=0x… PROTOCOL_TREASURY=0x… forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --private-key $DEPLOYER_PRIVATE_KEY`
   (mines the hook address, deploys hook → locker → launchpad, checks wiring, writes `deployments/4663.json`).
3. Verify sources on Blockscout: `forge verify-contract <address> <Contract> --chain 4663 --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/`.
4. `node contracts/script/export-abi.mjs` and put the addresses + deploy block into the web and indexer environments (`NEXT_PUBLIC_LAUNCHPAD`, `NEXT_PUBLIC_LOCKER`, `NEXT_PUBLIC_HOOK`, `NEXT_PUBLIC_START_BLOCK`; `LAUNCHPAD_ADDRESS`, `LOCKER_ADDRESS`, `HOOK_ADDRESS`, `START_BLOCK`).

## Production
- **web/** → Vercel. Env: see `.env.example` (RPC, indexer URL, WalletConnect projectId, Pinata JWT, DATABASE_URL + SESSION_SECRET for the forum, X handle).
- **indexer/** → Railway/Fly with Postgres (`DATABASE_URL`), `PONDER_RPC_URL_4663` = Alchemy URL.
- The contracts have no admin key over user funds. The owner can only change the treasury address and pause creation of new tokens.
- The contracts are open source and verified, but have not been externally audited.

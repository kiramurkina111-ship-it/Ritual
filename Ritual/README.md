# Ritual PumpPad

An occult arcade token launchpad for the Ritual Chain testnet.

The app is intentionally simple to run: it is a static website plus one Solidity
contract. No local Node.js install is required for the first version.

## What It Does

- Connects an EVM wallet to Ritual testnet.
- Launches ERC20 tokens through a `RitualPumpPad` factory.
- Lets users buy and sell whole tokens through a simple bonding curve.
- Shows a live token board by reading the factory contract.
- Uploads token images from a computer or phone. On Vercel, `/api/upload`
  pins compressed images to IPFS through Pinata when `PINATA_JWT` is set.
- Adds a light "oracle omen" generator in the UI for the playful AI-ish layer.

## Ritual Testnet

- Chain ID: `1979`
- Currency: `RITUAL`
- RPC: `https://rpc.ritualfoundation.org`
- Explorer: `https://explorer.ritualfoundation.org`
- Faucet: `https://faucet.ritualfoundation.org`

## Local Preview

Open `index.html` in your browser.

The site starts in demo mode. After deploying the contract, paste the factory
address into the Founder setup section.

## Contract Deployment With Remix

This is the easiest path if you are new to coding.

1. Open <https://remix.ethereum.org/>.
2. Create a new file named `RitualPumpPad.sol`.
3. Paste the contents of `contracts/RitualPumpPad.sol`.
4. In the Solidity compiler tab, choose compiler `0.8.24` or newer.
5. Compile `RitualPumpPad.sol`.
6. In MetaMask, add/switch to Ritual Chain testnet.
7. In the Deploy tab, choose `Injected Provider - MetaMask`.
8. Select the `RitualPumpPad` contract.
9. For the constructor `treasury_`, enter your own wallet address.
10. Deploy and confirm the transaction.
11. Copy the deployed contract address.
12. Paste it into the Founder setup box on the site and press Save.

Do not paste your seed phrase or private key anywhere.

## Deploy The Site To Vercel

1. Push this folder to a GitHub repository.
2. Open <https://vercel.com/new>.
3. Import the repository.
4. Use the default static project settings.
5. Deploy.

## Enable Image Uploads

The UI can always preview local images. For public uploads that other users can
see, create a Pinata API JWT and add it to Vercel:

```text
PINATA_JWT=your_pinata_jwt
```

The included `api/upload.js` endpoint uses Pinata's `pinFileToIPFS` API and
stores the resulting gateway URL in the launch transaction.

For a permanent public factory address, edit `src/config.js`:

```js
window.RITUAL_PUMPPAD_CONFIG = {
  factoryAddress: "0xYourDeployedFactory",
};
```

Then redeploy the site. Visitors can still override the address locally from the
Founder setup box while testing.

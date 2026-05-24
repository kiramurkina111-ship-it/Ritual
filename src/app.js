const RITUAL_CHAIN = {
  chainId: "0x7bb",
  chainName: "Ritual Chain Testnet",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: ["https://rpc.ritualfoundation.org"],
  blockExplorerUrls: ["https://explorer.ritualfoundation.org"],
};

const FACTORY_ABI = [
  "function launchFee() view returns (uint256)",
  "function createToken(string name,string symbol,string description,string imageURI,string omen) payable returns (address)",
  "function buy(address token,uint256 wholeTokens) payable",
  "function sell(address token,uint256 wholeTokens)",
  "function getTokens() view returns (address[])",
  "function getTokenBasics(address token) view returns (address creator,uint256 launchedAt)",
  "function getTokenStrings(address token) view returns (string name,string symbol,string description)",
  "function getTokenMedia(address token) view returns (string imageURI,string omen)",
  "function getTokenStats(address token) view returns (uint256 soldTokens,uint256 ritualReserve,uint256 vibeScore,bool exists)",
  "function quoteBuy(address token,uint256 wholeTokens) view returns (uint256 total,uint256 fee,uint256 cost)",
  "function quoteSell(address token,uint256 wholeTokens) view returns (uint256 payout,uint256 fee,uint256 gross)",
  "event TokenLaunched(address indexed token,address indexed creator,uint256 vibeScore)",
  "event TokensBought(address indexed token,address indexed buyer,uint256 wholeTokens,uint256 paid)",
  "event TokensSold(address indexed token,address indexed seller,uint256 wholeTokens,uint256 received)",
];

const TOKEN_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ETH = 10n ** 18n;
const MAX_UPLOAD_IMAGE_BYTES = 180 * 1024;
const MAX_DATA_URL_IMAGE_BYTES = 12 * 1024;
const IMAGE_SIZE = 512;

function parseEtherLocal(value) {
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}000000000000000000`.slice(0, 18);
  return BigInt(whole) * ETH + BigInt(padded);
}

const demoTokens = [
  {
    token: "demo-1",
    name: "Green Sigil",
    symbol: "SIGIL",
    description: "A neon ritual for builders who launch before the chain gets crowded.",
    imageURI: "",
    omen: "The machine altar detects builder energy and a suspiciously loud group chat.",
    soldTokens: 4200n,
    ritualReserve: parseEtherLocal("1.73"),
    vibeScore: 87n,
  },
  {
    token: "demo-2",
    name: "Agent Flame",
    symbol: "AGENT",
    description: "A tiny autonomous spark for contracts that think, act, and refuse to sleep.",
    imageURI: "",
    omen: "A slow green flame. Not explosive, but it keeps scheduling itself.",
    soldTokens: 1337n,
    ritualReserve: parseEtherLocal("0.66"),
    vibeScore: 64n,
  },
  {
    token: "demo-3",
    name: "TEE Hex",
    symbol: "TEE",
    description: "For terminal dwellers who like their memes with attested compute.",
    imageURI: "",
    omen: "Green text appears. Someone whispers that liquidity is a belief system.",
    soldTokens: 9001n,
    ritualReserve: parseEtherLocal("4.20"),
    vibeScore: 92n,
  },
];

const state = {
  provider: null,
  signer: null,
  account: null,
  factory: null,
  factoryAddress:
    localStorage.getItem("ritualPumpPadFactory") ||
    window.RITUAL_PUMPPAD_CONFIG?.factoryAddress ||
    "",
  uploadedImageURI: "",
  tokens: [],
};

const $ = (id) => document.getElementById(id);

const els = {
  walletButton: $("walletButton"),
  networkStatus: $("networkStatus"),
  factoryStatus: $("factoryStatus"),
  launchFee: $("launchFee"),
  oracleMood: $("oracleMood"),
  launchForm: $("launchForm"),
  tokenName: $("tokenName"),
  tokenSymbol: $("tokenSymbol"),
  tokenDescription: $("tokenDescription"),
  tokenImage: $("tokenImage"),
  tokenImageFile: $("tokenImageFile"),
  imagePreview: $("imagePreview"),
  clearImageButton: $("clearImageButton"),
  omenTitle: $("omenTitle"),
  omenText: $("omenText"),
  omenOrb: $("omenOrb"),
  vibeValue: $("vibeValue"),
  vibeBar: $("vibeBar"),
  tickerTape: $("tickerTape"),
  tokenGrid: $("tokenGrid"),
  refreshButton: $("refreshButton"),
  factoryInput: $("factoryInput"),
  saveFactoryButton: $("saveFactoryButton"),
  clearFactoryButton: $("clearFactoryButton"),
  toast: $("toast"),
};

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function hasEthers() {
  return Boolean(window.ethers);
}

function isAddress(value) {
  if (hasEthers()) {
    return window.ethers.isAddress(value);
  }
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 4200);
}

function hashText(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function generateOmen() {
  const name = els.tokenName.value.trim() || "Unnamed";
  const symbol = els.tokenSymbol.value.trim() || "???";
  const description = els.tokenDescription.value.trim();
  const hash = hashText(`${name}:${symbol}:${description}`);
  const score = 35 + (hash % 66);
  const moods = [
    "The Ritual mark flickers. The ticker smells like early builder chaos.",
    "A green prophecy forms: first believers get the loudest drums.",
    "The sigil wakes up. This one wants autonomous agents, not spreadsheets.",
    "A machine spirit nods from inside the TEE. Liquidity may arrive wearing a mask.",
    "The oracle sees a chart, a chant, and a very unreasonable Ritual group chat.",
  ];
  const title = score > 82 ? "Hot omen" : score > 62 ? "Strange omen" : "Quiet omen";
  const text = `${moods[hash % moods.length]} Vibe score: ${score}/100.`;

  els.omenTitle.textContent = title;
  els.omenText.textContent = text;
  els.vibeValue.textContent = score;
  els.vibeBar.style.width = `${score}%`;
  els.oracleMood.textContent = title;
  els.tickerTape.textContent = `${symbol} :: ${text}`;
  els.omenOrb.style.filter = `hue-rotate(${hash % 160}deg)`;
  return { score, text };
}

async function connectWallet() {
  if (!hasEthers()) {
    toast("Web3 library did not load. Check your internet connection and refresh.");
    return;
  }
  if (!window.ethereum) {
    toast("Install MetaMask or another EVM wallet first.");
    return;
  }

  state.provider = new window.ethers.BrowserProvider(window.ethereum);
  await window.ethereum.request({ method: "eth_requestAccounts" });
  state.signer = await state.provider.getSigner();
  state.account = await state.signer.getAddress();
  els.walletButton.textContent = shortAddress(state.account);
  await ensureRitualNetwork();
  bindFactory();
  await refresh();
}

async function ensureRitualNetwork() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current !== RITUAL_CHAIN.chainId) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: RITUAL_CHAIN.chainId }],
      });
    } catch (error) {
      if (error.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [RITUAL_CHAIN],
        });
      } else {
        throw error;
      }
    }
  }
  els.networkStatus.textContent = "Ritual testnet";
}

function bindFactory() {
  if (isAddress(state.factoryAddress) && state.provider && hasEthers()) {
    const runner = state.signer || state.provider;
    state.factory = new window.ethers.Contract(state.factoryAddress, FACTORY_ABI, runner);
    els.factoryStatus.textContent = shortAddress(state.factoryAddress);
    els.factoryInput.value = state.factoryAddress;
  } else {
    state.factory = null;
    els.factoryStatus.textContent = "Demo mode";
  }
}

async function refresh() {
  bindFactory();
  if (!state.factory) {
    state.tokens = demoTokens;
    els.launchFee.textContent = "0.01 RITUAL";
    renderTokens();
    return;
  }

  try {
    const fee = await state.factory.launchFee();
    els.launchFee.textContent = `${formatEth(fee)} RITUAL`;
    const addresses = await state.factory.getTokens();
    const infos = await Promise.all(
      addresses.map(async (address) => {
        const [basics, strings, media, stats] = await Promise.all([
          state.factory.getTokenBasics(address),
          state.factory.getTokenStrings(address),
          state.factory.getTokenMedia(address),
          state.factory.getTokenStats(address),
        ]);
        return normalizeInfo(address, basics, strings, media, stats);
      }),
    );
    state.tokens = infos.reverse();
    renderTokens();
  } catch (error) {
    console.error(error);
    toast("Could not read the factory. Check the address and network.");
  }
}

function normalizeInfo(address, basics, strings, media, stats) {
  return {
    token: address,
    creator: basics.creator,
    launchedAt: basics.launchedAt,
    name: strings.name,
    symbol: strings.symbol,
    description: strings.description,
    imageURI: media.imageURI,
    omen: media.omen,
    soldTokens: stats.soldTokens,
    ritualReserve: stats.ritualReserve,
    vibeScore: stats.vibeScore,
  };
}

function formatEth(value) {
  const formatted = hasEthers()
    ? window.ethers.formatEther(value)
    : `${value / ETH}.${String(value % ETH).padStart(18, "0")}`;
  return Number(formatted).toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}

function tokenArt(token) {
  if (
    token.imageURI &&
    (token.imageURI.startsWith("http") || token.imageURI.startsWith("data:image/"))
  ) {
    return `<img src="${escapeHtml(token.imageURI)}" alt="${escapeHtml(token.name)} token art" />`;
  }
  return `<span>${escapeHtml(token.symbol.slice(0, 5))}</span>`;
}

function canvasToDataURL(canvas, quality) {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) {
    return webp;
  }
  return canvas.toDataURL("image/jpeg", quality);
}

function dataURLToBlob(dataURL) {
  const [header, base64] = dataURL.split(",");
  const mime = header.match(/data:(.*?);/)?.[1] || "image/webp";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function estimateDataURLBytes(dataURL) {
  const base64 = dataURL.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("Could not read image file.")));
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("error", () => reject(new Error("Could not load this image.")));
      image.addEventListener("load", () => resolve(image));
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, IMAGE_SIZE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const qualities = [0.72, 0.58, 0.44, 0.32];
  let best = "";
  for (const quality of qualities) {
    best = canvasToDataURL(canvas, quality);
    if (estimateDataURLBytes(best) <= MAX_UPLOAD_IMAGE_BYTES) {
      return {
        dataURL: best,
        blob: dataURLToBlob(best),
        bytes: estimateDataURLBytes(best),
      };
    }
  }
  return {
    dataURL: best,
    blob: dataURLToBlob(best),
    bytes: estimateDataURLBytes(best),
  };
}

async function uploadImageToIPFS(blob, originalName) {
  if (!["http:", "https:"].includes(window.location.protocol)) {
    return null;
  }

  const formData = new FormData();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-") || "token-image.webp";
  formData.append("file", blob, safeName.replace(/\.[^.]+$/, ".webp"));

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Image upload API is not configured.");
  }
  return payload.url;
}

async function handleImageUpload(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    toast("Compressing token image...");
    const compressed = await compressImageFile(file);
    if (compressed.bytes > MAX_UPLOAD_IMAGE_BYTES) {
      state.uploadedImageURI = "";
      els.tokenImageFile.value = "";
      els.imagePreview.innerHTML = `<span>Image is still too large after compression. Try a smaller image.</span>`;
      toast("Image is too large. Try a smaller file.");
      return;
    }

    let imageURI = "";
    try {
      imageURI = await uploadImageToIPFS(compressed.blob, file.name);
    } catch (uploadError) {
      console.warn(uploadError);
    }

    if (!imageURI) {
      if (compressed.bytes > MAX_DATA_URL_IMAGE_BYTES) {
        state.uploadedImageURI = "";
        els.imagePreview.innerHTML = `<img src="${compressed.dataURL}" alt="Uploaded token preview" />`;
        toast("Preview ready, but public upload is not configured. Use an image URL or set PINATA_JWT on Vercel.");
        return;
      }
      imageURI = compressed.dataURL;
    }

    state.uploadedImageURI = imageURI;
    els.tokenImage.value = "";
    els.imagePreview.innerHTML = `<img src="${compressed.dataURL}" alt="Uploaded token preview" />`;
    toast(
      imageURI.startsWith("http")
        ? "Image uploaded to IPFS and ready for launch."
        : `Image ready: ${(compressed.bytes / 1024).toFixed(1)} KB after compression.`,
    );
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not process the image.");
  }
}

function clearUploadedImage(showToast = true) {
  state.uploadedImageURI = "";
  els.tokenImageFile.value = "";
  els.imagePreview.innerHTML = `<span>No uploaded image</span>`;
  if (showToast) {
    toast("Uploaded image cleared.");
  }
}

function getTokenImageURI() {
  return state.uploadedImageURI || els.tokenImage.value.trim();
}

function renderTokens() {
  if (!state.tokens.length) {
    els.tokenGrid.innerHTML = `<div class="panel">No tokens yet. Be the first to summon one.</div>`;
    return;
  }

  els.tokenGrid.innerHTML = state.tokens
    .map(
      (token) => `
        <article class="token-card" data-token="${escapeHtml(token.token)}">
          <div class="token-art">${tokenArt(token)}</div>
          <div class="token-title">
            <div>
              <h3>${escapeHtml(token.name)}</h3>
              <small>$${escapeHtml(token.symbol)}</small>
            </div>
            <strong>${Number(token.vibeScore)}%</strong>
          </div>
          <p>${escapeHtml(token.description || token.omen)}</p>
          <div class="token-meta">
            <span><strong>${Number(token.soldTokens).toLocaleString()}</strong> sold</span>
            <span><strong>${formatEth(token.ritualReserve)}</strong> RITUAL</span>
            <span><strong>${state.factory ? "live" : "demo"}</strong> mode</span>
          </div>
          <div class="trade-box">
            <input inputmode="numeric" min="1" step="1" value="100" aria-label="Whole tokens" />
            <button class="secondary-button" data-action="buy" type="button">Buy</button>
            <button class="ghost-button" data-action="sell" type="button">Sell</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function launchToken(event) {
  event.preventDefault();
  if (!state.factory) {
    toast("Demo mode is active. Deploy the factory and save its address first.");
    return;
  }
  if (!state.signer) {
    await connectWallet();
  }

  const omen = generateOmen();
  const fee = await state.factory.launchFee();
  const tx = await state.factory.createToken(
    els.tokenName.value.trim(),
    els.tokenSymbol.value.trim().toUpperCase(),
    els.tokenDescription.value.trim(),
    getTokenImageURI(),
    omen.text,
    { value: fee },
  );
  toast("Summoning transaction sent. Waiting for confirmation...");
  await tx.wait();
  toast("Token summoned on Ritual testnet.");
  els.launchForm.reset();
  clearUploadedImage(false);
  generateOmen();
  await refresh();
}

async function trade(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (!state.factory) {
    toast("This is demo mode. Save a deployed factory address to trade on-chain.");
    return;
  }
  if (!state.signer) {
    await connectWallet();
  }

  const card = button.closest(".token-card");
  const token = card.dataset.token;
  const input = card.querySelector("input");
  const amount = BigInt(Math.max(1, Number.parseInt(input.value, 10) || 1));
  const action = button.dataset.action;

  try {
    if (action === "buy") {
      const [total] = await state.factory.quoteBuy(token, amount);
      const tx = await state.factory.buy(token, amount, { value: total });
      toast("Buy transaction sent.");
      await tx.wait();
      toast("Buy confirmed.");
    } else {
      const tokenContract = new window.ethers.Contract(token, TOKEN_ABI, state.signer);
      const rawAmount = amount * 10n ** 18n;
      const allowance = await tokenContract.allowance(state.account, state.factoryAddress);
      if (allowance < rawAmount) {
        const approveTx = await tokenContract.approve(state.factoryAddress, rawAmount);
        toast("Approve transaction sent.");
        await approveTx.wait();
      }
      const tx = await state.factory.sell(token, amount);
      toast("Sell transaction sent.");
      await tx.wait();
      toast("Sell confirmed.");
    }
    await refresh();
  } catch (error) {
    console.error(error);
    toast(error.shortMessage || "Transaction failed or was rejected.");
  }
}

function saveFactoryAddress() {
  const address = els.factoryInput.value.trim();
  if (!isAddress(address)) {
    toast("Paste a valid 0x contract address.");
    return;
  }
  state.factoryAddress = address;
  localStorage.setItem("ritualPumpPadFactory", address);
  bindFactory();
  refresh();
  toast("Factory address saved.");
}

function clearFactoryAddress() {
  state.factoryAddress = "";
  localStorage.removeItem("ritualPumpPadFactory");
  bindFactory();
  refresh();
  toast("Demo mode restored.");
}

els.walletButton.addEventListener("click", connectWallet);
els.launchForm.addEventListener("submit", launchToken);
els.refreshButton.addEventListener("click", refresh);
els.saveFactoryButton.addEventListener("click", saveFactoryAddress);
els.clearFactoryButton.addEventListener("click", clearFactoryAddress);
els.tokenImageFile.addEventListener("change", handleImageUpload);
els.clearImageButton.addEventListener("click", () => clearUploadedImage());
els.tokenImage.addEventListener("input", () => {
  if (els.tokenImage.value.trim() && state.uploadedImageURI) {
    clearUploadedImage(false);
  }
});
els.tokenGrid.addEventListener("click", trade);
["input", "change"].forEach((eventName) => {
  [els.tokenName, els.tokenSymbol, els.tokenDescription].forEach((input) => {
    input.addEventListener(eventName, generateOmen);
  });
});

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", () => window.location.reload());
  window.ethereum.on?.("chainChanged", () => window.location.reload());
}

bindFactory();
generateOmen();
refresh();

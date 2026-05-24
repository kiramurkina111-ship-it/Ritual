const RITUAL_CHAIN = {
  chainId: "0x7bb",
  chainName: "Ritual Chain Testnet",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: ["https://rpc.ritualfoundation.org"],
  blockExplorerUrls: ["https://explorer.ritualfoundation.org"],
};

const FACTORY_ABI = [
  "function launchFee() view returns (uint256)",
  "function basePrice() view returns (uint256)",
  "function slope() view returns (uint256)",
  "function tradeFeeBps() view returns (uint256)",
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
const MAX_WHOLE_TOKENS = 1_000_000n;

function parseEtherLocal(value) {
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}000000000000000000`.slice(0, 18);
  return BigInt(whole) * ETH + BigInt(padded);
}

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
  uploadedImagePending: false,
  selectedToken: null,
  tradeMode: "buy",
  chartFrame: 3600,
  chartCache: new Map(),
  curve: {
    basePrice: parseEtherLocal("0.00000001"),
    slope: parseEtherLocal("0.00000000001"),
    tradeFeeBps: 100n,
  },
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
  tokenGrid: $("tokenGrid"),
  refreshButton: $("refreshButton"),
  factoryInput: $("factoryInput"),
  saveFactoryButton: $("saveFactoryButton"),
  clearFactoryButton: $("clearFactoryButton"),
  tokenModal: $("tokenModal"),
  modalTokenArt: $("modalTokenArt"),
  modalChart: $("modalChart"),
  modalTokenName: $("modalTokenName"),
  modalTokenDescription: $("modalTokenDescription"),
  modalTokenPrice: $("modalTokenPrice"),
  modalMarketCap: $("modalMarketCap"),
  modalSold: $("modalSold"),
  modalReserve: $("modalReserve"),
  modalBuyTab: $("modalBuyTab"),
  modalSellTab: $("modalSellTab"),
  modalTradeAmount: $("modalTradeAmount"),
  modalTradeQuote: $("modalTradeQuote"),
  modalTradeButton: $("modalTradeButton"),
  chartControls: $("chartControls"),
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

function configureFounderSetup() {
  const params = new URLSearchParams(window.location.search);
  const showSetup = params.get("setup") === "1";
  document.body.classList.toggle("show-founder-setup", showSetup);
  document.getElementById("setup")?.setAttribute("aria-hidden", showSetup ? "false" : "true");
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
  const symbol = els.tokenSymbol.value.trim() || "RITUAL";
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
  els.factoryInput.value = state.factoryAddress || "";
  if (isAddress(state.factoryAddress) && hasEthers()) {
    const runner =
      state.signer || state.provider || new window.ethers.JsonRpcProvider(RITUAL_CHAIN.rpcUrls[0]);
    state.factory = new window.ethers.Contract(state.factoryAddress, FACTORY_ABI, runner);
    els.factoryStatus.textContent = shortAddress(state.factoryAddress);
  } else {
    state.factory = null;
    els.factoryStatus.textContent = isAddress(state.factoryAddress) ? "Connect wallet" : "Not configured";
  }
}

async function refresh() {
  bindFactory();
  if (!state.factory) {
    state.tokens = [];
    els.launchFee.textContent = "0.01 RITUAL";
    renderTokens();
    return;
  }

  try {
    const [fee, basePrice, slope, tradeFeeBps] = await Promise.all([
      state.factory.launchFee(),
      state.factory.basePrice(),
      state.factory.slope(),
      state.factory.tradeFeeBps(),
    ]);
    state.curve = {
      basePrice,
      slope,
      tradeFeeBps,
    };
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

function formatRitual(value, maxDigits = 8) {
  const formatted = hasEthers()
    ? window.ethers.formatEther(value)
    : `${value / ETH}.${String(value % ETH).padStart(18, "0")}`;
  const number = Number(formatted);
  if (!Number.isFinite(number)) return "0 RITUAL";
  return `${number.toLocaleString(undefined, { maximumFractionDigits: maxDigits })} RITUAL`;
}

function priceAtSold(soldTokens) {
  return state.curve.basePrice + BigInt(soldTokens) * state.curve.slope;
}

function buyPriceWithFee(soldTokens, wholeTokens = 1n) {
  const amount = BigInt(wholeTokens);
  const linear = amount * state.curve.basePrice;
  const first = BigInt(soldTokens) * amount;
  const triangle = (amount * (amount - 1n)) / 2n;
  const cost = linear + (first + triangle) * state.curve.slope;
  const fee = (cost * state.curve.tradeFeeBps) / 10_000n;
  return cost + fee;
}

function tokenPrice(token) {
  return buyPriceWithFee(token.soldTokens || 0n, 1n);
}

function marketCap(token) {
  return tokenPrice(token) * MAX_WHOLE_TOKENS;
}

function ritualToNumber(value) {
  return Number(value) / Number(ETH);
}

function formatAxisPrice(value) {
  const number = typeof value === "bigint" ? ritualToNumber(value) : value;
  if (!Number.isFinite(number) || number === 0) return "0";
  if (number < 0.000001) return number.toExponential(1);
  if (number < 0.01) return number.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  return number.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatTimeLabel(timestamp, frameSeconds) {
  const date = new Date(timestamp * 1000);
  if (frameSeconds >= 86400) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function imageSrc(uri) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${uri.replace("ipfs://", "")}`;
  }
  if (uri.startsWith("http") || uri.startsWith("data:image/")) {
    return uri;
  }
  return "";
}

function tokenArt(token) {
  const src = imageSrc(token.imageURI);
  if (src) {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.name)} token art" loading="lazy" />`;
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
        state.uploadedImagePending = true;
        els.imagePreview.innerHTML = `<img src="${compressed.dataURL}" alt="Uploaded token preview" />`;
        toast("Preview ready, but public upload is not configured. Use an image URL or set PINATA_JWT on Vercel.");
        return;
      }
      state.uploadedImagePending = true;
      imageURI = compressed.dataURL;
    }

    state.uploadedImageURI = imageURI;
    state.uploadedImagePending = false;
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
  state.uploadedImagePending = false;
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
    const message = state.factory
      ? "No tokens launched yet. Be the first to summon one."
      : "Connect your wallet to read the Ritual PumpPad factory.";
    els.tokenGrid.innerHTML = `<div class="panel empty-market">${message}</div>`;
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
            <span><strong>${formatRitual(tokenPrice(token))}</strong> Token price</span>
            <span><strong>${formatRitual(marketCap(token), 2)}</strong> Market cap</span>
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

function findToken(address) {
  return state.tokens.find((token) => token.token.toLowerCase() === address.toLowerCase());
}

function emptyCandleChart(message = "No trades yet") {
  return `
    <svg viewBox="0 0 680 320" role="img" aria-label="Candlestick price chart">
      <path class="chart-grid" d="M70 30V270H650M70 210H650M70 150H650M70 90H650" />
      <text x="70" y="24">Price</text>
      <text x="650" y="300" text-anchor="end">Time</text>
      <text x="340" y="158" text-anchor="middle" class="chart-empty">${escapeHtml(message)}</text>
    </svg>
  `;
}

function fallbackCandleChart(token) {
  const now = Math.floor(Date.now() / 1000);
  const price = ritualToNumber(tokenPrice(token));
  return candleChartSvg(
    [
      {
        start: now - state.chartFrame,
        open: price,
        high: price,
        low: price,
        close: price,
      },
    ],
    state.chartFrame,
    "Waiting for trades",
  );
}

function candleChartSvg(candles, frameSeconds, emptyLabel = "") {
  const width = 640;
  const height = 320;
  const left = 70;
  const right = 20;
  const top = 30;
  const bottom = 50;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const lows = candles.map((candle) => candle.low);
  const highs = candles.map((candle) => candle.high);
  let min = Math.min(...lows);
  let max = Math.max(...highs);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return emptyCandleChart();
  if (min === max) {
    min = min * 0.98;
    max = max * 1.02 + 0.000000001;
  }
  const yFor = (value) => top + ((max - value) / (max - min)) * plotHeight;
  const candleWidth = Math.max(5, Math.min(22, plotWidth / Math.max(candles.length, 1) - 6));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((tick) => max - (max - min) * tick);
  const xLabels = candles.length > 1
    ? [candles[0], candles[Math.floor(candles.length / 2)], candles[candles.length - 1]]
    : candles;

  const candleMarkup = candles
    .map((candle, index) => {
      const x = left + (index + 0.5) * (plotWidth / candles.length);
      const openY = yFor(candle.open);
      const closeY = yFor(candle.close);
      const highY = yFor(candle.high);
      const lowY = yFor(candle.low);
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      const direction = candle.close >= candle.open ? "up" : "down";
      return `
        <line class="candle-wick ${direction}" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${highY.toFixed(1)}" y2="${lowY.toFixed(1)}" />
        <rect class="candle-body ${direction}" x="${(x - candleWidth / 2).toFixed(1)}" y="${bodyY.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" />
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Candlestick price chart">
      <path class="chart-grid" d="M${left} ${top}V${height - bottom}H${width - right}M${left} ${top + plotHeight * 0.25}H${width - right}M${left} ${top + plotHeight * 0.5}H${width - right}M${left} ${top + plotHeight * 0.75}H${width - right}" />
      ${yTicks
        .map((tick) => `<text x="${left - 8}" y="${yFor(tick) + 4}" text-anchor="end">${formatAxisPrice(tick)}</text>`)
        .join("")}
      ${xLabels
        .map((candle, index) => {
          const x = xLabels.length === 1 ? left + plotWidth / 2 : left + (plotWidth * index) / (xLabels.length - 1);
          return `<text x="${x}" y="${height - 16}" text-anchor="${index === 0 ? "start" : index === xLabels.length - 1 ? "end" : "middle"}">${formatTimeLabel(candle.start, frameSeconds)}</text>`;
        })
        .join("")}
      ${candleMarkup}
      <text x="${left}" y="20">Price, RITUAL</text>
      <text x="${width - right}" y="20" text-anchor="end">${frameSeconds >= 86400 ? "1 day" : `${frameSeconds / 60} min`} candles</text>
      ${emptyLabel ? `<text x="${left + plotWidth / 2}" y="${top + plotHeight / 2}" text-anchor="middle" class="chart-empty">${escapeHtml(emptyLabel)}</text>` : ""}
    </svg>
  `;
}

async function getEventTimestamp(event) {
  const block = await event.getBlock();
  return block.timestamp;
}

async function fetchTokenTrades(tokenAddress) {
  const cacheKey = tokenAddress.toLowerCase();
  if (state.chartCache.has(cacheKey)) return state.chartCache.get(cacheKey);
  if (!state.factory) return [];

  const buyFilter = state.factory.filters.TokensBought(tokenAddress);
  const sellFilter = state.factory.filters.TokensSold(tokenAddress);
  const [buyEvents, sellEvents] = await Promise.all([
    state.factory.queryFilter(buyFilter, 0, "latest"),
    state.factory.queryFilter(sellFilter, 0, "latest"),
  ]);
  const events = [...buyEvents, ...sellEvents].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.index - b.index;
  });

  const trades = await Promise.all(
    events.map(async (event) => {
      const wholeTokens = event.args.wholeTokens;
      const value = event.fragment.name === "TokensBought" ? event.args.paid : event.args.received;
      return {
        timestamp: await getEventTimestamp(event),
        price: ritualToNumber(value / wholeTokens),
      };
    }),
  );
  state.chartCache.set(cacheKey, trades);
  return trades;
}

function buildCandles(trades, frameSeconds) {
  if (!trades.length) return [];
  const buckets = new Map();
  for (const trade of trades) {
    const start = Math.floor(trade.timestamp / frameSeconds) * frameSeconds;
    const current = buckets.get(start);
    if (!current) {
      buckets.set(start, {
        start,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
      });
    } else {
      current.high = Math.max(current.high, trade.price);
      current.low = Math.min(current.low, trade.price);
      current.close = trade.price;
    }
  }
  return [...buckets.values()].sort((a, b) => a.start - b.start).slice(-48);
}

async function renderCandleChart(token) {
  els.modalChart.innerHTML = emptyCandleChart("Loading trades...");
  try {
    const trades = await fetchTokenTrades(token.token);
    const candles = buildCandles(trades, state.chartFrame);
    els.modalChart.innerHTML = candles.length
      ? candleChartSvg(candles, state.chartFrame)
      : fallbackCandleChart(token);
  } catch (error) {
    console.error(error);
    els.modalChart.innerHTML = fallbackCandleChart(token);
  }
}

function setModalMode(mode) {
  state.tradeMode = mode;
  els.modalBuyTab.classList.toggle("is-active", mode === "buy");
  els.modalSellTab.classList.toggle("is-active", mode === "sell");
  els.modalTradeButton.textContent = mode === "buy" ? "Buy token" : "Sell token";
  updateModalQuote();
}

async function updateModalQuote() {
  if (!state.selectedToken) return;
  const amount = BigInt(Math.max(1, Number.parseInt(els.modalTradeAmount.value, 10) || 1));
  try {
    if (state.factory && state.tradeMode === "buy") {
      const [total] = await state.factory.quoteBuy(state.selectedToken.token, amount);
      els.modalTradeQuote.textContent = `Estimated cost: ${formatRitual(total)} for ${amount.toLocaleString()} token(s).`;
    } else if (state.factory) {
      const [payout] = await state.factory.quoteSell(state.selectedToken.token, amount);
      els.modalTradeQuote.textContent = `Estimated receive: ${formatRitual(payout)} for ${amount.toLocaleString()} token(s).`;
    }
  } catch {
    els.modalTradeQuote.textContent = "This amount is not available for the current curve state.";
  }
}

function openTokenModal(token) {
  state.selectedToken = token;
  els.modalTokenArt.innerHTML = tokenArt(token);
  renderCandleChart(token);
  els.modalTokenName.textContent = `${token.name} ($${token.symbol})`;
  els.modalTokenDescription.textContent = token.description || token.omen || "";
  els.modalTokenPrice.textContent = formatRitual(tokenPrice(token));
  els.modalMarketCap.textContent = formatRitual(marketCap(token), 2);
  els.modalSold.textContent = Number(token.soldTokens).toLocaleString();
  els.modalReserve.textContent = formatRitual(token.ritualReserve);
  els.modalTradeAmount.value = "100";
  setModalMode("buy");
  els.tokenModal.classList.add("is-open");
  els.tokenModal.setAttribute("aria-hidden", "false");
}

function closeTokenModal() {
  els.tokenModal.classList.remove("is-open");
  els.tokenModal.setAttribute("aria-hidden", "true");
  state.selectedToken = null;
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
  if (state.uploadedImagePending) {
    toast("The selected image is only a preview. Configure IPFS upload or choose a smaller image before launch.");
    return;
  }
  if (!state.factory) {
    toast("Connect your wallet first so the app can read the Ritual PumpPad factory.");
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

async function executeTrade(token, amount, action) {
  if (!state.factory) {
    toast("Connect your wallet first so the app can read the Ritual PumpPad factory.");
    return;
  }
  if (!state.signer) {
    await connectWallet();
  }

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
    if (state.selectedToken) {
      const freshToken = findToken(token);
      if (freshToken) openTokenModal(freshToken);
    }
  } catch (error) {
    console.error(error);
    toast(error.shortMessage || "Transaction failed or was rejected.");
  }
}

async function trade(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest(".token-card");
  const token = card.dataset.token;
  const input = card.querySelector("input");
  const amount = BigInt(Math.max(1, Number.parseInt(input.value, 10) || 1));
  await executeTrade(token, amount, button.dataset.action);
}

function handleTokenGridClick(event) {
  if (event.target.closest("button, input, a")) return;
  const card = event.target.closest(".token-card");
  if (!card) return;
  const token = findToken(card.dataset.token);
  if (token) openTokenModal(token);
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
  toast("Factory override cleared.");
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
els.tokenGrid.addEventListener("click", handleTokenGridClick);
els.tokenGrid.addEventListener("click", trade);
els.tokenModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) closeTokenModal();
});
els.modalBuyTab.addEventListener("click", () => setModalMode("buy"));
els.modalSellTab.addEventListener("click", () => setModalMode("sell"));
els.modalTradeAmount.addEventListener("input", updateModalQuote);
els.modalTradeButton.addEventListener("click", async () => {
  if (!state.selectedToken) return;
  const amount = BigInt(Math.max(1, Number.parseInt(els.modalTradeAmount.value, 10) || 1));
  await executeTrade(state.selectedToken.token, amount, state.tradeMode);
});
els.chartControls.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-chart-frame]");
  if (!button || !state.selectedToken) return;
  state.chartFrame = Number(button.dataset.chartFrame);
  els.chartControls
    .querySelectorAll("button")
    .forEach((item) => item.classList.toggle("is-active", item === button));
  renderCandleChart(state.selectedToken);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTokenModal();
});
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
configureFounderSetup();
generateOmen();
refresh();

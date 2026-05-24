export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return json({ error: "PINATA_JWT is not configured." }, 500);
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "Missing image file." }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return json({ error: "Only image uploads are allowed." }, 400);
  }
  if (file.size > 200 * 1024) {
    return json({ error: "Image is too large after compression." }, 400);
  }

  const formData = new FormData();
  formData.append("file", file, file.name || "ritual-token.webp");
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: file.name || "ritual-token.webp",
      keyvalues: {
        app: "Ritual PumpPad",
      },
    }),
  );

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({ error: payload.error?.details || payload.error || "Pinata upload failed." }, 502);
  }

  return json({
    cid: payload.IpfsHash,
    url: `https://gateway.pinata.cloud/ipfs/${payload.IpfsHash}`,
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

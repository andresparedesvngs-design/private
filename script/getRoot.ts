import dotenv from "dotenv";
dotenv.config();

const url = "http://192.168.1.85:8082/";

async function run() {
  try {
    const res = await fetch(url, {
      method: "GET",
    });
    const body = await res.text();
    console.log("GET_ROOT", {
      url,
      status: res.status,
      ok: res.ok,
      body: body.slice(0, 300),
    });
  } catch (err: any) {
    console.error("GET_ROOT_ERROR", {
      message: err?.message ?? String(err),
      causeMessage: err?.cause?.message,
      causeCode: err?.cause?.code,
    });
  }
}

run().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });

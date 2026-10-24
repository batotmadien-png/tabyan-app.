// api/explain.js — Vercel serverless function (needs env var GROQ_API_KEY)
// llama-4-scout was retired by Groq (Jul 2026); qwen3.6-27b is the vision replacement
const MODEL = "qwen/qwen3.6-27b";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: "GROQ_API_KEY is not set" });

  const { images = [], text = "", level = "adult", lang = "العربية", compare = false } = req.body || {};
  if (!images.length && text.trim().length < 20) {
    return res.status(400).json({ error: "no_input" });
  }

  const levels = {
    adult: "clear everyday language for an adult with no medical background",
    simple: "very simple words, short sentences, like explaining to a 12 year old",
    kids: "gentle, friendly wording suitable for a child, with comforting tone"
  };

  const system = `You are Tabyan, a medical-report simplifier. You EXPLAIN reports in plain language. You NEVER diagnose, never prescribe, never suggest medicines or doses, never say the person is definitely sick or healthy.
Write every text value in: ${lang}. Style: ${levels[level] || levels.adult}.
${compare ? "The user gave TWO reports: first is OLDER, second is NEWER. Compare them." : "The user gave ONE report."}
If the input is not a medical report, return {"error":"not_medical"}.
Return ONLY valid JSON with this shape:
{
 "summary": "2-3 sentence plain summary",
 "detail": "a short paragraph (4-6 sentences) explaining the findings; use the exact terms listed in findings so they can be highlighted",
 "importance": "low | medium | high",
 "importance_note": "one calm sentence about follow-up, never a diagnosis",
 "region": "head | chest | abdomen | pelvis | spine | limbs | other",
 "findings": [{"term": "hard term exactly as written in detail", "meaning": "simple meaning"}],
 "questions": ["3-5 questions to ask the doctor"],
 "changes": [{"item": "what", "direction": "better | worse | same | new", "note": "short note"}]
}
"changes" is an empty array when there is only one report.`;

  const content = [{ type: "text", text: text.trim() ? "Report text:\n" + text.slice(0, 12000) : "Report is in the image(s)." }];
  images.slice(0, 2).forEach((u) => content.push({ type: "image_url", image_url: { url: u } }));

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 4000,
        messages: [{ role: "system", content: system }, { role: "user", content }]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("GROQ ERROR:", JSON.stringify(data));
      return res.status(502).json({ error: "ai_failed", detail: data.error && data.error.message });
    }
    let raw = data.choices[0].message.content || "";
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
    const m = raw.match(/\{[\s\S]*\}/);
    const out = JSON.parse(m ? m[0] : raw);
    return res.status(200).json(out);
  } catch (e) {
    console.error("SERVER ERROR:", e);
    return res.status(500).json({ error: "server_error" });
  }
};

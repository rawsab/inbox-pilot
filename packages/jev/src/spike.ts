/**
 * Stage 1 Jev feasibility spike.
 * Runs only when TYPESAFE_API_KEY is set. Never sends real mailbox content.
 */
import { SystemOneClient } from "./http-client.js";

async function main() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    console.log(
      JSON.stringify({
        ok: false,
        blocked: true,
        reason: "TYPESAFE_API_KEY unset — real Jev spike skipped; mock path remains available",
      }),
    );
    process.exit(0);
  }

  const baseUrl = process.env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai";
  const model = process.env.TYPESAFE_MODEL ?? "jev-1.13.0";
  const client = new SystemOneClient({ apiKey, baseUrl });

  const syntheticState = {
    from: "noreply@example-corp.test",
    subject: "We received your application",
    body: "Thank you for your application for Software Engineer at Example Corp. This is synthetic fixture text for a Stage 1 spike.",
    note: "SYNTHETIC_ONLY — not from a real mailbox",
  };

  const start = Date.now();
  try {
    const noulArm = await client.systemOne({
      model,
      state: syntheticState,
      questions: {
        is_application_confirmation: {
          type: "noul",
          instructions:
            "Answer yes if this email explicitly confirms receipt of a submitted job application.",
        },
        is_offer: {
          type: "noul",
          instructions: "Answer yes if this email is an explicit employment or internship offer.",
        },
        company_supported: {
          type: "noul",
          instructions:
            "Answer yes if the text supports Example Corp as the hiring company for this message.",
        },
      },
    });

    const choiceArm = await client.systemOne({
      model,
      state: syntheticState,
      questions: {
        category: {
          type: "choice",
          instructions: "Pick the single best recruiting category for this email.",
          options: [
            "application_confirmation",
            "rejection",
            "interview",
            "offer",
            "update",
            "newsletter",
            "not_recruiting",
            "unknown",
          ],
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          blocked: false,
          latency_ms: Date.now() - start,
          model,
          baseUrl,
          noul_arm_keys: Object.keys(noulArm.answers ?? noulArm),
          choice_arm_keys: Object.keys(choiceArm.answers ?? choiceArm),
          redacted_noul: redact(noulArm),
          redacted_choice: redact(choiceArm),
          note: "Confirm retention/training terms before enabling real-mail transfer.",
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        ok: false,
        blocked: true,
        error: err instanceof Error ? err.message : String(err),
        note: "Milestone remains blocked for live integration until a synthetic request succeeds.",
      }),
    );
    process.exitCode = 1;
  }
}

function redact(value: unknown): unknown {
  // Spike output is synthetic; still avoid dumping huge payloads.
  const s = JSON.stringify(value);
  if (s.length > 2000) return JSON.parse(s.slice(0, 2000) + '"}');
  return value;
}

main();

import {
  Candidate,
  FieldType,
  PARSER_VERSION,
} from "@inbox-pilot/contracts";

const APPLICATION_PATTERN =
  /your application (?:for|to)\s+(.+?)\s+at\s+([A-Z][\w.&'\- ]{1,60})/i;
const ROLE_AT_COMPANY = /(?:for|regarding)\s+the\s+(.+?)\s+(?:role|position)\s+at\s+([A-Z][\w.&'\- ]{1,60})/i;
const SUBJECT_AT = /^(.+?)\s+[-–—|]\s+(.+)$/;
/** Greenhouse-style confirmation. */
const ATS_GREENHOUSE =
  /thanks for applying to\s+([A-Z][\w.&'\- ]{1,60})\s+for\s+the\s+(.+?)\s+role/i;
/** Lever-style confirmation. */
const ATS_LEVER =
  /application for\s+(.+?)\s+at\s+([A-Z][\w.&'\- ]{1,60})\s+was (?:successfully )?submitted/i;

export const ATS_DOMAINS = new Set([
  "greenhouse.io",
  "lever.co",
  "myworkday.com",
  "ashbyhq.com",
  "jobvite.com",
  "smartrecruiters.com",
]);

function makeCandidate(
  field: FieldType,
  original: string,
  start: number,
  end: number,
  ruleId: string,
  segment: Candidate["source_segment"],
  rank: number,
  idSuffix: string,
): Candidate {
  const normalized = original
    .replace(/\s+/g, " ")
    .replace(/,?\s*(Inc|LLC|Ltd|Corp)\.?$/i, "")
    .trim();
  return {
    candidate_id: `${field}_${idSuffix}`,
    field_type: field,
    normalized_value: normalized,
    original_value: original.trim(),
    source_segment: segment,
    start,
    end,
    rule_id: ruleId,
    parser_version: PARSER_VERSION,
    rank,
  };
}

/**
 * Deterministic Stage 1 candidate extractor.
 * Never treats ATS sender brands as the employer.
 */
export function extractCandidates(input: {
  subject: string;
  body: string;
  senderDisplayName?: string;
  senderDomain?: string;
}): Candidate[] {
  const companies: Candidate[] = [];
  const roles: Candidate[] = [];
  const combined = `${input.subject}\n${input.body}`;

  const gh = ATS_GREENHOUSE.exec(combined);
  if (gh?.index !== undefined && gh[1] && gh[2] && companies.length === 0) {
    companies.push(
      makeCandidate(
        FieldType.COMPANY,
        gh[1],
        gh.index + gh[0].indexOf(gh[1]),
        gh.index + gh[0].indexOf(gh[1]) + gh[1].length,
        "ats.greenhouse_thanks_applying",
        "body",
        1,
        "gh1",
      ),
    );
    roles.push(
      makeCandidate(
        FieldType.ROLE,
        gh[2],
        gh.index + gh[0].indexOf(gh[2]),
        gh.index + gh[0].indexOf(gh[2]) + gh[2].length,
        "ats.greenhouse_thanks_applying",
        "body",
        1,
        "gh1",
      ),
    );
  }

  const lever = ATS_LEVER.exec(combined);
  if (lever?.index !== undefined && lever[1] && lever[2] && companies.length === 0) {
    roles.push(
      makeCandidate(
        FieldType.ROLE,
        lever[1],
        lever.index + lever[0].indexOf(lever[1]),
        lever.index + lever[0].indexOf(lever[1]) + lever[1].length,
        "ats.lever_application_submitted",
        "body",
        1,
        "lv1",
      ),
    );
    companies.push(
      makeCandidate(
        FieldType.COMPANY,
        lever[2],
        lever.index + lever[0].indexOf(lever[2]),
        lever.index + lever[0].indexOf(lever[2]) + lever[2].length,
        "ats.lever_application_submitted",
        "body",
        1,
        "lv1",
      ),
    );
  }

  const app = APPLICATION_PATTERN.exec(combined);
  if (app?.index !== undefined && app[1] && app[2] && companies.length === 0) {
    roles.push(
      makeCandidate(
        FieldType.ROLE,
        app[1],
        app.index + app[0].indexOf(app[1]),
        app.index + app[0].indexOf(app[1]) + app[1].length,
        "body.application_for_role_at",
        "body",
        1,
        "1",
      ),
    );
    companies.push(
      makeCandidate(
        FieldType.COMPANY,
        app[2],
        app.index + app[0].indexOf(app[2]),
        app.index + app[0].indexOf(app[2]) + app[2].length,
        "body.application_for_role_at",
        "body",
        1,
        "1",
      ),
    );
  }

  const roleAt = ROLE_AT_COMPANY.exec(combined);
  if (roleAt?.index !== undefined && roleAt[1] && roleAt[2] && companies.length === 0) {
    roles.push(
      makeCandidate(
        FieldType.ROLE,
        roleAt[1],
        roleAt.index,
        roleAt.index + roleAt[1].length,
        "body.role_at_company",
        "body",
        roles.length + 1,
        String(roles.length + 1),
      ),
    );
    companies.push(
      makeCandidate(
        FieldType.COMPANY,
        roleAt[2],
        roleAt.index,
        roleAt.index + roleAt[0].length,
        "body.role_at_company",
        "body",
        companies.length + 1,
        String(companies.length + 1),
      ),
    );
  }

  if (companies.length === 0) {
    const subj = SUBJECT_AT.exec(input.subject);
    if (subj?.[1] && subj[2]) {
      // Weak subject hint only — still a candidate with provenance.
      companies.push(
        makeCandidate(
          FieldType.COMPANY,
          subj[1],
          0,
          subj[1].length,
          "subject.company_pipe_role",
          "subject",
          1,
          "subj1",
        ),
      );
      roles.push(
        makeCandidate(
          FieldType.ROLE,
          subj[2],
          subj[1].length + 3,
          input.subject.length,
          "subject.company_pipe_role",
          "subject",
          1,
          "subj1",
        ),
      );
    }
  }

  // Sender display name is a weak hint; never from known ATS domains.
  if (
    companies.length === 0 &&
    input.senderDisplayName &&
    input.senderDomain &&
    !ATS_DOMAINS.has(input.senderDomain.toLowerCase())
  ) {
    companies.push(
      makeCandidate(
        FieldType.COMPANY,
        input.senderDisplayName,
        0,
        input.senderDisplayName.length,
        "sender.display_name_weak",
        "sender",
        3,
        "sender1",
      ),
    );
  }

  return [...companies.slice(0, 3), ...roles.slice(0, 3)];
}

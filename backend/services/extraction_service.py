"""
Structured information extraction service.

Extracts typed facts from document text using pattern matching and keyword
search. Every extracted fact carries its verbatim source_text so the user
can verify that no content was invented.

Design philosophy:
  - Only extract a fact when there is actual textual evidence.
  - Return "not found" (by omitting the field) rather than guessing.
  - Never assign a confidence score we cannot back up.
  - Clearly mark inferred facts (is_inferred=True) vs directly stated ones.

Supported fact types:
  document_title     → From filename or first heading found
  inspection_date    → Dates near keywords like "date", "inspected on"
  location           → Text near "location", "site", "facility"
  hazard             → Sentences containing hazard/risk/danger keywords
  ppe_requirement    → Sentences about required PPE (hardhat, vest, gloves…)
  corrective_action  → Sentences about corrective/remedial actions
  recommendation     → Sentences about recommendations/suggestions
  responsible_party  → Names/roles near "responsible", "assigned to"
  deadline           → Dates near "by", "deadline", "complete by"
  safety_procedure   → Sentences about procedures/steps
  precaution         → Sentences about precautions/warnings
"""

import logging
import re
from datetime import datetime, timezone

from backend.models.document_models import ExtractedFact

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def extract_facts(
    document_id: int,
    pages: list,
    file_type: str,
    original_filename: str,
) -> list:
    """Extract structured facts from a list of page dicts.

    Args:
        document_id:       FK for ExtractedFact records.
        pages:             [{"page": int|None, "text": str}, ...]
        file_type:         "pdf" | "docx" | "txt"
        original_filename: Used as fallback document_title.

    Returns:
        List of ExtractedFact objects (not yet added to session).
    """
    facts = []
    all_text = " ".join(p["text"] for p in pages)

    # --- document title ---
    title_fact = _extract_title(document_id, pages, original_filename)
    if title_fact:
        facts.append(title_fact)

    # --- sentence-level extraction ---
    sentences = _split_sentences(all_text, pages)

    for sent, page_num in sentences:
        sent_lower = sent.lower()

        # inspection / audit date
        facts.extend(_extract_dates(document_id, sent, sent_lower, page_num))

        # location / site
        facts.extend(_extract_location(document_id, sent, sent_lower, page_num))

        # hazards
        facts.extend(_extract_hazards(document_id, sent, sent_lower, page_num))

        # PPE requirements
        facts.extend(_extract_ppe_requirements(document_id, sent, sent_lower, page_num))

        # corrective actions
        facts.extend(_extract_corrective_actions(document_id, sent, sent_lower, page_num))

        # recommendations
        facts.extend(_extract_recommendations(document_id, sent, sent_lower, page_num))

        # responsible parties / deadlines
        facts.extend(_extract_responsible_and_deadlines(document_id, sent, sent_lower, page_num))

        # safety procedures / precautions
        facts.extend(_extract_safety_procedures(document_id, sent, sent_lower, page_num))

    # De-duplicate: remove facts where (fact_type, value[:80]) is identical
    facts = _deduplicate(facts)

    log.info("Extracted %d facts from document %d", len(facts), document_id)
    return facts


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------

def _extract_title(document_id, pages, original_filename):
    """Try to find the document title from the first few lines of page 1."""
    if not pages:
        return None

    first_page_text = pages[0]["text"]
    first_lines = [ln.strip() for ln in first_page_text.split("\n") if ln.strip()]

    for line in first_lines[:5]:
        # A title is typically short (< 120 chars) and not a sentence fragment
        if 5 < len(line) < 120 and not line.endswith(","):
            return ExtractedFact(
                document_id  = document_id,
                fact_type    = "document_title",
                value        = line,
                source_text  = line,
                page_number  = pages[0].get("page"),
                confidence   = "medium",
                is_inferred  = True,  # heuristic — not a tagged metadata field
            )

    # Fallback: use original filename without extension
    stem = re.sub(r"[\._\-]", " ", original_filename.rsplit(".", 1)[0]).title()
    return ExtractedFact(
        document_id  = document_id,
        fact_type    = "document_title",
        value        = stem,
        source_text  = original_filename,
        page_number  = None,
        confidence   = "low",
        is_inferred  = True,
    )


# Date patterns (matches: 2024-05-01, 01/05/2024, May 1 2024, 1 May 2024, etc.)
_DATE_PATTERN = re.compile(
    r"\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}"
    r"|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}"
    r"|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?"
    r"|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\s+\d{1,2},?\s+\d{4}"
    r"|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?"
    r"|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\s+\d{4})\b",
    re.IGNORECASE,
)

_DATE_TRIGGER_WORDS = re.compile(
    r"\b(date|dated|inspected|conducted|performed|issued|prepared|completed"
    r"|audit date|inspection date|report date)\b",
    re.IGNORECASE,
)

_DEADLINE_TRIGGER_WORDS = re.compile(
    r"\b(by|deadline|complete by|due|due date|target date|no later than)\b",
    re.IGNORECASE,
)


def _extract_dates(document_id, sent, sent_lower, page_num):
    """Extract inspection dates and deadlines."""
    facts = []
    dates = _DATE_PATTERN.findall(sent)
    if not dates:
        return facts

    if _DATE_TRIGGER_WORDS.search(sent):
        for date_str in dates:
            facts.append(ExtractedFact(
                document_id = document_id,
                fact_type   = "inspection_date",
                value       = date_str,
                source_text = sent.strip(),
                page_number = page_num,
                confidence  = "high",
                is_inferred = False,
            ))
    elif _DEADLINE_TRIGGER_WORDS.search(sent):
        for date_str in dates:
            facts.append(ExtractedFact(
                document_id = document_id,
                fact_type   = "deadline",
                value       = date_str,
                source_text = sent.strip(),
                page_number = page_num,
                confidence  = "medium",
                is_inferred = False,
            ))

    return facts


_LOCATION_TRIGGER = re.compile(
    r"\b(location|site|facility|plant|building|floor|area|zone|department"
    r"|premises|address|conducted at|performed at|inspected at)\b",
    re.IGNORECASE,
)


def _extract_location(document_id, sent, sent_lower, page_num):
    if not _LOCATION_TRIGGER.search(sent):
        return []
    value = sent.strip()
    if len(value) > 300:
        return []  # Too long — probably not a location sentence
    return [ExtractedFact(
        document_id = document_id,
        fact_type   = "location",
        value       = value,
        source_text = value,
        page_number = page_num,
        confidence  = "medium",
        is_inferred = False,
    )]


_HAZARD_TRIGGER = re.compile(
    r"\b(hazard|risk|danger|unsafe|injury|incident|accident|exposure"
    r"|slipping|fall|crush|electrical|chemical|fire|explosion|toxic"
    r"|health risk|safety concern|near miss|struck by|caught in)\b",
    re.IGNORECASE,
)


def _extract_hazards(document_id, sent, sent_lower, page_num):
    if not _HAZARD_TRIGGER.search(sent):
        return []
    value = sent.strip()
    if len(value) < 10 or len(value) > 500:
        return []
    return [ExtractedFact(
        document_id = document_id,
        fact_type   = "hazard",
        value       = value,
        source_text = value,
        page_number = page_num,
        confidence  = "high",
        is_inferred = False,
    )]


_PPE_TRIGGER = re.compile(
    r"\b(ppe|personal protective equipment|hardhat|hard hat|helmet|safety vest"
    r"|high.?visibility|hi.?vis|gloves|goggles|safety glasses|face shield"
    r"|respirator|mask|ear protection|steel.?toe|harness|fall protection"
    r"|required to wear|must wear|shall wear|wear appropriate)\b",
    re.IGNORECASE,
)


def _extract_ppe_requirements(document_id, sent, sent_lower, page_num):
    if not _PPE_TRIGGER.search(sent):
        return []
    value = sent.strip()
    if len(value) < 10 or len(value) > 500:
        return []
    # If the sentence appears to be just a heading (no verb / very short body),
    # use only the most relevant clause rather than the whole heading.
    # Heuristic: trim to the first sentence that contains an action verb.
    _ACTION_VERB = re.compile(
        r'\b(wear|worn|required|must|shall|should|need|use|don|put on|equipped)\b',
        re.IGNORECASE,
    )
    if not _ACTION_VERB.search(value) and len(value.split()) < 12:
        # Too heading-like — keep it but mark low confidence
        return [ExtractedFact(
            document_id = document_id,
            fact_type   = "ppe_requirement",
            value       = value,
            source_text = value,
            page_number = page_num,
            confidence  = "low",
            is_inferred = True,
        )]
    return [ExtractedFact(
        document_id = document_id,
        fact_type   = "ppe_requirement",
        value       = value,
        source_text = value,
        page_number = page_num,
        confidence  = "high",
        is_inferred = False,
    )]


_CORRECTIVE_TRIGGER = re.compile(
    r"\b(corrective action|corrective measure|remedial action|immediate action"
    r"|action required|action item|must be fixed|should be corrected"
    r"|needs to be|repair|replace|install|remove|guard|barrier)\b",
    re.IGNORECASE,
)


def _extract_corrective_actions(document_id, sent, sent_lower, page_num):
    if not _CORRECTIVE_TRIGGER.search(sent):
        return []
    value = sent.strip()
    if len(value) < 10 or len(value) > 500:
        return []
    return [ExtractedFact(
        document_id = document_id,
        fact_type   = "corrective_action",
        value       = value,
        source_text = value,
        page_number = page_num,
        confidence  = "high",
        is_inferred = False,
    )]


_RECOMMENDATION_TRIGGER = re.compile(
    r"\b(recommend|suggestion|advise|it is recommended|it is suggested"
    r"|should consider|we recommend|best practice)\b",
    re.IGNORECASE,
)


def _extract_recommendations(document_id, sent, sent_lower, page_num):
    if not _RECOMMENDATION_TRIGGER.search(sent):
        return []
    value = sent.strip()
    if len(value) < 10 or len(value) > 500:
        return []
    return [ExtractedFact(
        document_id = document_id,
        fact_type   = "recommendation",
        value       = value,
        source_text = value,
        page_number = page_num,
        confidence  = "medium",
        is_inferred = False,
    )]


_RESPONSIBLE_TRIGGER = re.compile(
    r"\b(responsible|assigned to|owned by|contact|supervisor|manager"
    r"|inspector|officer|person in charge|pic)\b",
    re.IGNORECASE,
)


def _extract_responsible_and_deadlines(document_id, sent, sent_lower, page_num):
    facts = []
    if _RESPONSIBLE_TRIGGER.search(sent):
        value = sent.strip()
        if 10 <= len(value) <= 300:
            facts.append(ExtractedFact(
                document_id = document_id,
                fact_type   = "responsible_party",
                value       = value,
                source_text = value,
                page_number = page_num,
                confidence  = "medium",
                is_inferred = False,
            ))
    return facts


_PROCEDURE_TRIGGER = re.compile(
    r"\b(procedure|process|step|instruction|guideline|protocol|method"
    r"|follow these|the following steps)\b",
    re.IGNORECASE,
)

_PRECAUTION_TRIGGER = re.compile(
    r"\b(precaution|warning|caution|do not|never|always|ensure|make sure"
    r"|attention|note:|important:)\b",
    re.IGNORECASE,
)


def _extract_safety_procedures(document_id, sent, sent_lower, page_num):
    facts = []
    value = sent.strip()

    if len(value) < 10 or len(value) > 600:
        return []

    if _PRECAUTION_TRIGGER.search(sent):
        facts.append(ExtractedFact(
            document_id = document_id,
            fact_type   = "precaution",
            value       = value,
            source_text = value,
            page_number = page_num,
            confidence  = "high",
            is_inferred = False,
        ))
    elif _PROCEDURE_TRIGGER.search(sent):
        facts.append(ExtractedFact(
            document_id = document_id,
            fact_type   = "safety_procedure",
            value       = value,
            source_text = value,
            page_number = page_num,
            confidence  = "medium",
            is_inferred = False,
        ))

    return facts


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _split_sentences(all_text: str, pages: list) -> list:
    """Split text into (sentence, page_number) pairs.

    We use a simple regex split rather than NLTK to avoid extra dependencies.
    Page attribution is approximate: we match each sentence to the page that
    contains it by position in the concatenated text.
    """
    # Build a mapping: character offset → page_number
    offset_map = []
    current_offset = 0
    for p in pages:
        offset_map.append((current_offset, current_offset + len(p["text"]), p.get("page")))
        current_offset += len(p["text"]) + 1  # +1 for the join space

    def get_page(offset):
        for start, end, page in offset_map:
            if start <= offset < end:
                return page
        return None

    # Split on sentence boundaries
    sentence_splitter = re.compile(r"(?<=[.!?])\s+")
    sentences = sentence_splitter.split(all_text)

    result = []
    offset = 0
    for sent in sentences:
        sent = sent.strip()
        if len(sent) >= 20:  # skip very short fragments
            result.append((sent, get_page(offset)))
        offset += len(sent) + 1

    return result


def _deduplicate(facts: list) -> list:
    """Remove facts that share the same (fact_type, value prefix) or source_text prefix.

    Two facts are duplicates if they share the same fact_type AND either:
      - Their lowercased value shares the same first 80 chars, OR
      - Their lowercased source_text shares the same first 120 chars.
    """
    seen_value = set()
    seen_source = set()
    unique = []
    for f in facts:
        value_key  = (f.fact_type, f.value[:80].lower())
        source_key = (f.fact_type, (f.source_text or "")[:120].lower())
        if value_key not in seen_value and source_key not in seen_source:
            seen_value.add(value_key)
            seen_source.add(source_key)
            unique.append(f)
    return unique

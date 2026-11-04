"""
Database models for Milestone 2: Document Intelligence.

Three new tables are added alongside the existing User/Analysis/Detection tables:

  Document      — one uploaded file (PDF, DOCX, TXT).
  DocumentChunk — a text segment extracted from a Document, used for FTS5 search.
  ExtractedFact — a structured piece of information found in a Document
                  (e.g. a hazard, a PPE requirement, a corrective action).

Design notes:
  - Every ExtractedFact retains verbatim source_text so users can verify it.
  - DocumentChunks store page numbers so search results can cite exact pages.
  - Reprocessing a document safely clears old chunks/facts before inserting new ones.
"""

from datetime import datetime, timezone

from backend.extensions import db


class Document(db.Model):
    """One uploaded document and its processing state."""

    __tablename__ = "document"

    id = db.Column(db.Integer, primary_key=True)

    # --- who uploaded it ---
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False, index=True
    )

    # --- file identity ---
    original_filename = db.Column(db.String(300), nullable=False)
    stored_filename   = db.Column(db.String(300), nullable=False, unique=True)
    file_type         = db.Column(db.String(10),  nullable=False)  # pdf | docx | txt
    file_size_bytes   = db.Column(db.Integer,      nullable=True)

    # --- document category (user-assigned) ---
    category = db.Column(db.String(50), nullable=True)  # e.g. inspection_report | manual | sop | guideline

    # --- processing ---
    status = db.Column(db.String(30), default="pending")
    # Possible values:
    #   pending     → file saved, processing not yet started
    #   extracting  → text extraction in progress
    #   indexing    → inserting chunks into FTS5
    #   completed   → fully processed
    #   failed      → unrecoverable error
    #   partial     → processed with warnings (e.g. scanned PDF)

    processing_error   = db.Column(db.Text, nullable=True)
    extraction_warnings = db.Column(db.Text, nullable=True)  # newline-separated list

    # --- extracted metadata ---
    page_count       = db.Column(db.Integer, nullable=True)
    word_count       = db.Column(db.Integer, nullable=True)
    char_count       = db.Column(db.Integer, nullable=True)
    is_scanned_pdf   = db.Column(db.Boolean, default=False)   # True if OCR may be needed
    content_hash     = db.Column(db.String(64), nullable=True)  # SHA-256 of file bytes

    # --- timestamps ---
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    processed_at  = db.Column(db.DateTime, nullable=True)

    # --- relationships ---
    chunks = db.relationship(
        "DocumentChunk", backref="document", lazy="dynamic",
        cascade="all, delete-orphan"
    )
    facts = db.relationship(
        "ExtractedFact", backref="document", lazy="dynamic",
        cascade="all, delete-orphan"
    )

    def to_dict(self, include_chunks=False):
        data = {
            "id":                   self.id,
            "user_id":              self.user_id,
            "original_filename":    self.original_filename,
            "file_type":            self.file_type,
            "file_size_bytes":      self.file_size_bytes,
            "category":             self.category,
            "status":               self.status,
            "processing_error":     self.processing_error,
            "extraction_warnings":  self.extraction_warnings,
            "page_count":           self.page_count,
            "word_count":           self.word_count,
            "char_count":           self.char_count,
            "is_scanned_pdf":       self.is_scanned_pdf,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
            "processed_at":         self.processed_at.isoformat() if self.processed_at else None,
            "chunk_count":          self.chunks.count(),
            "fact_count":           self.facts.count(),
        }
        if include_chunks:
            data["chunks"] = [c.to_dict() for c in self.chunks.order_by("chunk_index")]
        return data


class DocumentChunk(db.Model):
    """A text segment extracted from a Document.

    Chunks are the unit used for full-text search (FTS5).
    Each chunk knows its source page so search results can cite it.
    """

    __tablename__ = "document_chunk"

    id           = db.Column(db.Integer, primary_key=True)
    document_id  = db.Column(
        db.Integer, db.ForeignKey("document.id"), nullable=False, index=True
    )
    chunk_index  = db.Column(db.Integer,  nullable=False)  # 0-based order within document
    text         = db.Column(db.Text,     nullable=False)
    page_number  = db.Column(db.Integer,  nullable=True)   # 1-based; None for txt/docx without pages
    section_heading = db.Column(db.String(300), nullable=True)  # nearest heading, if detectable
    word_count   = db.Column(db.Integer,  nullable=True)
    is_toc       = db.Column(db.Boolean,  default=False)   # True if chunk is a Table of Contents entry

    def to_dict(self):
        return {
            "id":              self.id,
            "document_id":     self.document_id,
            "chunk_index":     self.chunk_index,
            "text":            self.text,
            "page_number":     self.page_number,
            "section_heading": self.section_heading,
            "word_count":      self.word_count,
            "is_toc":          self.is_toc,
        }


class ExtractedFact(db.Model):
    """One structured piece of information extracted from a Document.

    Every fact is tied to its verbatim source text so the user can
    verify that the system did not fabricate or misread it.

    fact_type examples:
      document_title | inspection_date | location | hazard |
      ppe_requirement | corrective_action | recommendation |
      responsible_party | deadline | safety_procedure | precaution
    """

    __tablename__ = "extracted_fact"

    id          = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(
        db.Integer, db.ForeignKey("document.id"), nullable=False, index=True
    )

    fact_type    = db.Column(db.String(50),  nullable=False)
    value        = db.Column(db.Text,        nullable=False)
    source_text  = db.Column(db.Text,        nullable=True)   # verbatim passage that supports this fact
    page_number  = db.Column(db.Integer,     nullable=True)
    confidence   = db.Column(db.String(10),  nullable=True)   # 'high' | 'medium' | 'low' — only set by pattern match
    is_inferred  = db.Column(db.Boolean,     default=False)   # True if derived rather than directly stated

    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id":          self.id,
            "document_id": self.document_id,
            "fact_type":   self.fact_type,
            "value":       self.value,
            "source_text": self.source_text,
            "page_number": self.page_number,
            "confidence":  self.confidence,
            "is_inferred": self.is_inferred,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
        }

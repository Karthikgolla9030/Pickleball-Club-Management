"""
Aught2 Pickleball — Media Storage Service

Provides secure, tenant-isolated image processing and storage for:
- Club branding (logo, cover)
- Carousel slides
- Entity banners and cards (tournaments, leagues, events, courts, lessons)

Security & Validation:
- Validates file content using Pillow magic-bytes and format detection (never trusts filename/header).
- Enforces configurable size limits (default 5MB) and dimension constraints (max 4096x4096px).
- Strips sensitive metadata (EXIF/GPS tags) by re-encoding clean pixels.
- Generates cryptographically safe UUID-based filenames to prevent path traversal and collisions.
- Stores assets outside ephemeral paths in persistent volume storage or S3-compatible cloud storage.
- Tracks assets in `club_media_assets` table for multi-tenant isolation and safe cleanup.
"""
from __future__ import annotations

import io
import logging
import os
import uuid
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.club_asset import ClubMediaAsset

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
}

MAX_DIMENSION = 4096  # Max width or height in pixels


class MediaStorageService:
    def __init__(self, db: AsyncSession | None = None) -> None:
        self.db = db
        self.settings = get_settings()

    def _get_uploads_root(self) -> Path:
        """Resolve persistent root directory for local uploads."""
        if self.settings.UPLOAD_DIR:
            root = Path(self.settings.UPLOAD_DIR).resolve()
        else:
            # Default to backend/uploads
            backend_dir = Path(__file__).resolve().parent.parent.parent
            root = (backend_dir / "uploads").resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    def validate_and_process_image(
        self,
        raw_bytes: bytes,
        max_size_bytes: int | None = None,
    ) -> tuple[bytes, str, str, int, int]:
        """
        Validate raw image bytes and strip metadata.

        Returns:
            (processed_bytes, file_extension, mime_type, width, height)
        """
        max_bytes = max_size_bytes or self.settings.MAX_UPLOAD_SIZE_BYTES
        if len(raw_bytes) > max_bytes:
            mb_limit = max_bytes / (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image file exceeds maximum allowed size of {mb_limit:.1f} MB",
            )

        if not raw_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty image data provided",
            )

        try:
            image = Image.open(io.BytesIO(raw_bytes))
            image.verify()  # Verify image integrity
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image file or corrupt image data",
            )

        # Reopen after verify() because verify() invalidates the file pointer
        try:
            image = Image.open(io.BytesIO(raw_bytes))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to decode image data",
            )

        detected_format = image.format
        if not detected_format or detected_format.upper() not in SUPPORTED_FORMATS:
            allowed = ", ".join(SUPPORTED_FORMATS.keys())
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported image format: {detected_format}. Allowed formats: {allowed}",
            )

        # Transpose according to EXIF orientation if needed, then strip EXIF
        try:
            image = ImageOps.exif_transpose(image)
        except Exception:
            pass

        width, height = image.size
        if width > MAX_DIMENSION or height > MAX_DIMENSION:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image dimensions ({width}x{height}) exceed maximum allowed dimensions ({MAX_DIMENSION}x{MAX_DIMENSION}px)",
            )
        if width <= 0 or height <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image dimensions",
            )

        fmt_key = detected_format.upper()
        ext, mime = SUPPORTED_FORMATS[fmt_key]

        # Re-encode to strip EXIF and metadata cleanly
        out_buffer = io.BytesIO()
        if fmt_key == "JPEG":
            if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
                rgba_img = image.convert("RGBA")
                bg = Image.new("RGB", rgba_img.size, (255, 255, 255))
                bg.paste(rgba_img, mask=rgba_img.split()[3])
                image = bg
            elif image.mode != "RGB":
                image = image.convert("RGB")
            image.save(out_buffer, format="JPEG", quality=88, optimize=True)
        elif fmt_key == "PNG":
            image.save(out_buffer, format="PNG", optimize=True)
        elif fmt_key == "WEBP":
            image.save(out_buffer, format="WEBP", quality=88, method=4)

        clean_bytes = out_buffer.getvalue()
        return clean_bytes, ext, mime, width, height

    async def store_image(
        self,
        raw_bytes: bytes,
        category: str,
        club_id: UUID,
        uploaded_by_user_id: UUID | None = None,
        asset_type: str = "general",
        entity_type: str | None = None,
        entity_id: UUID | None = None,
        original_filename: str | None = None,
    ) -> tuple[str, ClubMediaAsset]:
        """
        Processes image, persists it to storage, and records in database.

        Returns:
            (public_url, media_asset_record)
        """
        clean_bytes, ext, mime, width, height = self.validate_and_process_image(raw_bytes)

        safe_filename = f"{uuid.uuid4().hex}.{ext}"

        # ── S3 Object Storage (if configured) ──────────────────────
        if self.settings.STORAGE_BACKEND.lower() == "s3" and self.settings.S3_BUCKET:
            try:
                import boto3

                s3_kwargs: dict[str, Any] = {}
                if self.settings.S3_REGION:
                    s3_kwargs["region_name"] = self.settings.S3_REGION
                if self.settings.S3_ENDPOINT_URL:
                    s3_kwargs["endpoint_url"] = self.settings.S3_ENDPOINT_URL
                if self.settings.S3_ACCESS_KEY_ID and self.settings.S3_SECRET_ACCESS_KEY:
                    s3_kwargs["aws_access_key_id"] = self.settings.S3_ACCESS_KEY_ID
                    s3_kwargs["aws_secret_access_key"] = self.settings.S3_SECRET_ACCESS_KEY

                s3_client = boto3.client("s3", **s3_kwargs)
                s3_key = f"{category}/{club_id}/{safe_filename}"
                s3_client.put_object(
                    Bucket=self.settings.S3_BUCKET,
                    Key=s3_key,
                    Body=clean_bytes,
                    ContentType=mime,
                )

                if self.settings.S3_PUBLIC_URL_PREFIX:
                    public_url = f"{self.settings.S3_PUBLIC_URL_PREFIX.rstrip('/')}/{s3_key}"
                else:
                    public_url = f"https://{self.settings.S3_BUCKET}.s3.amazonaws.com/{s3_key}"

                file_path = f"s3://{self.settings.S3_BUCKET}/{s3_key}"
            except Exception as exc:
                logger.error("Failed to upload image to S3: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Cloud storage upload failed",
                )
        else:
            # ── Local Persistent Volume Storage ────────────────────
            root = self._get_uploads_root()
            dest_dir = root / category
            dest_dir.mkdir(parents=True, exist_ok=True)

            target_file = dest_dir / safe_filename
            with open(target_file, "wb") as f:
                f.write(clean_bytes)

            file_path = str(target_file)
            base_url = self.settings.UPLOAD_BASE_URL.rstrip("/")
            public_url = f"{base_url}/{category}/{safe_filename}"

        # ── Register Media Asset in DB ─────────────────────────────
        media_asset = ClubMediaAsset(
            club_id=club_id,
            uploaded_by_user_id=uploaded_by_user_id,
            asset_type=asset_type,
            entity_type=entity_type,
            entity_id=entity_id,
            file_path=file_path,
            public_url=public_url,
            original_filename=original_filename,
            mime_type=mime,
            file_size_bytes=len(clean_bytes),
            width=width,
            height=height,
        )

        if self.db:
            self.db.add(media_asset)
            await self.db.flush()

        return public_url, media_asset

    async def delete_asset(self, media_asset_id: UUID, club_id: UUID) -> bool:
        """
        Delete an asset and its underlying file safely with tenant validation.
        """
        if not self.db:
            return False

        stmt = select(ClubMediaAsset).where(
            ClubMediaAsset.id == media_asset_id,
            ClubMediaAsset.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        asset = res.scalar_one_or_none()
        if not asset:
            return False

        # Attempt to delete file on disk if local
        if not asset.file_path.startswith("s3://"):
            try:
                p = Path(asset.file_path)
                if p.exists():
                    p.unlink()
            except Exception as e:
                logger.warning("Failed to remove local asset file %s: %s", asset.file_path, e)

        await self.db.delete(asset)
        await self.db.flush()
        return True

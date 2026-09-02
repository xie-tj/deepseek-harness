# Agent Note: Durable video attachments

Status: implemented

English | [中文](2026-09-02-video-attachments.zh.md)

## Problem

The Web conversation contract already carried video intake and rendering references, while the attachment store, model adapters, Host admission, and authenticated reads supported only images. The partial capability prevented a clean build and could not durably reconstruct a video-bearing request.

## Decision

Video is a second durable attachment kind with its own media types, byte/count limits, content reference, local container validation, and verified read path. The Host decodes canonical base64, saves every video before appending its owning user message, authorizes reads only for references found in that session, and rejects a video-less model before admission or model selection.

The client keeps unsent video files and object URLs in the existing input owner. ui-conversation declares a video message slot and ui-attachment renders the rail, historical video control, and mixed-media lightbox. The LLM content map carries VideoBlock; adapters either serialize the kind explicitly or reject it. The direct DeepSeek adapter remains video-ineligible.

## Alternatives considered

**Remove the incomplete video UI.** This would make the build green by discarding the existing multimodal contract, MIME intake, and presentation work. A complete durable attachment path preserves the product capability instead.

**Treat video as an image.** Video containers have different validation, no image normalization or route-specific image request policy, and models may support one modality without the other. A tagged attachment kind makes every consumer state its behavior.

## Consequences

Video admission shares the image path's persistence ordering and authenticated session reads but maintains separate limits and container checks. The provider capability is explicit: video reaches only routes that advertise it, while image-only and text-only routes remain available for sessions without video history.

## Related

This extends the image-only attachment lifecycle in [Web multimodal image input and durable attachments](2026-07-22-web-multimodal-image-input-and-durable-attachments.md) without changing its image normalization and request-version decisions.

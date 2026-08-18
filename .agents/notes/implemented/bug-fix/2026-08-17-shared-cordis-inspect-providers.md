# Agent Note: Share fixed Host inspect providers across Cordis presets

Status: implemented

English | [中文](2026-08-17-shared-cordis-inspect-providers.zh.md)

## Problem

An Agent preset mounts one standing composition per preset id. A user-authored copy of the shipped `cordis` preset therefore mounts a second `tool-cordis` composition beside the shipped one. Both compositions register the fixed `Service`, `Event`, `Builtin`, and `Tool` providers in the process-global Host inspect registry. The registry's ordinary duplicate check rejected the second provider set, so creating a Session from the copied preset failed with `agent-preset-invalid` while the first Cordis preset remained mounted.

The Host inspect directory and Client query router are process-global by design, while each query already receives the requesting Agent. The four providers have identical manifests and behavior across `tool-cordis` mounts; only `Tool.listTools` reads Agent-specific state, and it does so through that explicit query context. This is the ownership model described by the broader [Cordis dynamic-package design](../../proposed/architecture/2026-08-08-cordis-web-dynamic-packages.md#inspect-providers-and-catalogs).

## Decision

`CordisInspectRegistryService.register()` retains strict single-owner registration. `registerShared()` is the explicit operation for independently mounted owners of one fixed provider definition. It validates the manifest, shares only an exact match, retains the first query handler, counts owners, and removes the provider after the last idempotent disposer runs. A conflicting ordinary registration or a shared registration with a different manifest still fails loud.

`tool-cordis` uses `registerShared()` only for its generated `Service` and `Event` providers and its fixed `Builtin` and `Tool` providers. A caller using this operation is responsible for making every same-manifest handler behaviorally interchangeable; a provider whose implementation varies by owner needs a distinct id, an Agent-scoped lookup inside its query, or one host-owned registration instead.

## Alternatives considered

**Move the four providers into the Web host composition.** This would also prevent duplicate registration, but it would make the provider directory outlive every `tool-cordis` mount and add tool-package ownership to the Web bundle. Reference-counted registration keeps availability attached to the feature compositions that contribute it.

**Make the Host inspect registry Agent-scoped.** The registry also owns one Client manifest mirror and pending cross-page query routing for the process. Duplicating that state per Agent would introduce conflicting Client directories and routing lifecycles even though each query already carries its Agent.

**Ignore every duplicate provider id.** An id alone does not prove that schemas or behavior agree, and disposing the first owner could remove a provider still needed by another preset. Exact-manifest matching plus reference ownership preserves conflict detection and lifecycle.

**Replace the current handler with the newest registration.** Mount and disposal order would decide behavior, and removing the newest owner would require restoring an older closure. Retaining one interchangeable handler avoids an ownership stack; non-interchangeable handlers are not eligible for shared registration.

## Consequences

The shipped Cordis preset and any behaviorally identical authored copy can remain mounted together, so Session creation does not depend on which preset registered Host inspection first. The provider list contains one row per fixed id, and disposing either preset leaves the providers available until the final owner disposes.

Focused registry coverage pins shared lifetime and final removal. A real shipped-Web-composition test mounts the shipped `cordis` preset and a user-authored copy concurrently and verifies that both Agents receive the Cordis tools. Ordinary duplicate registration remains strict, and different shared manifests remain errors; future shared-provider call sites must add equivalent-handler and teardown evidence rather than treating `registerShared()` as general duplicate suppression.

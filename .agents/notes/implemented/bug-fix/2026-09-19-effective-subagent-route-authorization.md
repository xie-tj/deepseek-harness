# Agent Note: Effective subagent route authorization

Status: implemented

English | [中文](2026-09-19-effective-subagent-route-authorization.zh.md)

## Problem

A `subagent/model-selection-policy` event records an exact user authorization decision, so every concrete child route must obey it regardless of how the route is supplied.

## Decision

With a recorded policy, `dsh-tool-subagent` resolves the effective provider/model from provider defaults, tool configuration, model fields, and parent inheritance, then rejects a route outside the policy before LLM preflight or child creation.

Omitted model-facing fields do not bypass authorization: an omitted call must resolve to an allowed route, and an absent effective provider/model rejects.

A definition without a recorded policy preserves the existing provider path and does not require the optional LLM service for an otherwise pure inherited route.

## Alternatives considered

**Authorize only model-facing fields.** Rejected because configured, provider-owned, and inherited defaults still select the model that runs the child.

**Trust configured or provider-owned defaults.** Rejected because deployment defaults can change the actual child route outside the Session's durable user decision.

**Validate after creating the child.** Rejected because the child could begin work before the authorization failure reaches the caller.

## Consequences

- A Session owner must include any route a child can derive from configuration, a provider, or its parent in the recorded policy.
- An enabled policy preflights every child route through `ctx.llm`; a missing LLM service rejects rather than delegating on an unchecked route.
- Focused execution tests cover parent, configured, and provider-owned defaults, including permitted provider defaults.

## Related decisions

This decision refines [model-selected subagent routes](../feature/2026-08-18-model-selected-subagent-routes.md) and [user-authorized subagent model routes](../feature/2026-08-24-user-authorized-subagent-model-routes.md).

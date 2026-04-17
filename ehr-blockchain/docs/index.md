# Documentation Index

This directory contains the **implementation documentation** for the EHR Blockchain system. The capstone paper (Chapters 1–3) remains the authoritative spec document in `README.md`; everything else here describes how the code actually works.

## Positioning

> **Blockchain-Notarized EHR for Regulatory Compliance.**
> A conventional EHR backend with AES-256-GCM field encryption, role-based access, and an immutable notarization layer on Stellar Soroban. Not a trustless record store; the backend remains the authoritative enforcement point.

## Files

| File | What's in it |
|---|---|
| [`README.md`](README.md) | Capstone paper, Chapters 1–3 (spec document) |
| [`architecture.md`](architecture.md) | Component diagram, tech stack, backend module map, trust boundaries |
| [`data-flows.md`](data-flows.md) | Mermaid sequence diagrams for login, record create, verify, grant, audit, backfill |
| [`smart-contracts.md`](smart-contracts.md) | Per-contract spec, storage layout, invariants, known limitations, proposed v2 |
| [`security-model.md`](security-model.md) | STRIDE threat model, controls matrix, residual risks |
| [`compliance.md`](compliance.md) | HIPAA / GDPR / DPA 10173 control mapping with implementation status |
| [`api.md`](api.md) | Full HTTP API reference with auth, roles, request/response shapes, errors |
| [`stellar-admin-rotation.md`](stellar-admin-rotation.md) | Runbook for rotating `STELLAR_ADMIN_KEY` and redeploying contracts |

## Reading order

- **New contributor**: architecture → data-flows → api → security-model
- **Committee reviewer**: README (paper) → architecture → smart-contracts → security-model (§8 Residual Risks) → compliance
- **Ops / deployment**: architecture (§9) → security-model (§6) → stellar-admin-rotation

## Status

All six implementation docs are current as of the last backend build. Each document flags its own known limitations in-line; nothing here is aspirational — the "Future Work" sections are clearly labeled as such.

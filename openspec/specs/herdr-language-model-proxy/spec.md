# herdr-language-model-proxy Specification

## Purpose

Adapt AI SDK LanguageModelV3 requests to external agents running through Herdr.

## Requirements

### Requirement: Adapt generation and streaming
The proxy MUST map supported messages/options to Herdr, and MUST adapt text, stream parts, usage, finish, and error results to LanguageModelV3-compatible output.

#### Scenario: Text result
- GIVEN selected target returns completed text
- WHEN generation finishes
- THEN proxy returns text, usage, finish reason, and correlation data

#### Scenario: Synthetic stream result
- GIVEN selected target returns completed output
- WHEN streaming is requested
- THEN proxy emits valid start, metadata, text, and finish parts in order, using one or few chunks

#### Scenario: External error
- GIVEN Herdr or external agent fails
- WHEN proxy receives failure
- THEN it returns a structured sanitized error without fallback

### Requirement: Represent delegated-agent capability and cancellation
The proxy MUST represent external CLI work that may edit files or run tools through final text and metadata, MUST NOT fabricate OpenCode-native structured tool parts, and MUST honor abort signals through lifecycle cleanup.

#### Scenario: Delegated-agent tool work
- GIVEN external agent edits files or runs tools during delegation
- WHEN proxy receives its completed response
- THEN proxy returns final text and metadata without fabricating native structured tool calls or results

#### Scenario: Cancellation
- GIVEN request is active and abort signal fires
- WHEN proxy cancels work
- THEN external work stops or is marked cancelled and owned Herdr resources are cleaned up

#### Scenario: Safe task transport
- GIVEN messages contain shell metacharacters or multiline text
- WHEN proxy sends task to Herdr
- THEN content remains data and cannot change executable or argument boundaries

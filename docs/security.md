# Security

Production-grade security posture for MemberSearch.

---

## Principles

1. **Defense in Depth**: Multiple security layers (network, IAM, encryption)
2. **Least Privilege**: Minimal permissions per component
3. **Zero Trust**: Verify every request, even internal
4. **Encryption Everywhere**: At rest and in transit

---

## Secrets Management (SSM Parameter Store)

### Stored Secrets

| Parameter | Type | Description |
|-----------|------|-------------|
| `/membersearch/prod/opensearch/endpoint` | SecureString | OpenSearch domain URL |
| `/membersearch/prod/cognito/user-pool-id` | SecureString | Cognito user pool ID |
| `/membersearch/prod/cognito/client-id` | SecureString | Cognito app client ID |

### Access Pattern

```typescript
// config.service.ts
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

async function getSecret(name: string): Promise<string> {
  const client = new SSMClient({});
  const response = await client.send(
    new GetParameterCommand({
      Name: name,
      WithDecryption: true,  // KMS decryption
    })
  );
  return response.Parameter?.Value ?? '';
}
```

### IAM Policy for SSM Access

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:GetParameters"],
  "Resource": "arn:aws:ssm:*:*:parameter/membersearch/prod/*"
}
```

### KMS Key Policy (for SecureString)

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::<ACCOUNT_ID>:role/MemberSearchApiRole"},
  "Action": ["kms:Decrypt"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:ViaService": "ssm.us-east-1.amazonaws.com"
    }
  }
}
```

---

## Encryption at Rest

| Component | Encryption | Key |
|-----------|------------|-----|
| DynamoDB | AES-256 | AWS-managed or CMK |
| OpenSearch | AES-256 | AWS-managed or CMK |
| S3 (if used) | SSE-S3 or SSE-KMS | AWS-managed or CMK |
| SQS DLQ | SSE-SQS | AWS-managed |
| CloudWatch Logs | Default encryption | AWS-managed |

### DynamoDB CMK Configuration

```yaml
# Terraform
resource "aws_dynamodb_table" "members" {
  name = "members"
  
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.membersearch.arn
  }
}
```

### OpenSearch Domain Encryption

```yaml
resource "aws_opensearch_domain" "membersearch" {
  domain_name = "membersearch"
  
  encrypt_at_rest {
    enabled    = true
    kms_key_id = aws_kms_key.membersearch.arn
  }
  
  node_to_node_encryption {
    enabled = true
  }
}
```

---

## Encryption in Transit

| Path | Protocol | Enforcement |
|------|----------|-------------|
| Client → API Gateway | HTTPS/TLS 1.2+ | API Gateway default |
| API Gateway → NestJS | HTTPS/TLS 1.2+ | VPC Link or Lambda |
| NestJS → OpenSearch | HTTPS/TLS 1.2+ | VPC endpoint |
| Lambda → DynamoDB | HTTPS/TLS 1.2+ | AWS SDK default |
| Lambda → OpenSearch | HTTPS/TLS 1.2+ | IAM signing + TLS |

### Enforce TLS 1.2 Minimum

```typescript
// OpenSearch client configuration
import { Client } from '@opensearch-project/opensearch';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';

const client = new Client({
  node: process.env.OPENSEARCH_NODE,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },
});
```

---

## Network Security

### VPC Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         VPC                                  │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │  Public Subnet   │    │      Private Subnet           │  │
│  │  ┌────────────┐  │    │  ┌──────────┐  ┌──────────┐  │  │
│  │  │ API Gateway│  │    │  │  ECS     │  │OpenSearch│  │  │
│  │  │ (VPC Link) │──┼────┼──│  NestJS  │──│ VPC EP   │  │  │
│  │  └────────────┘  │    │  └──────────┘  └──────────┘  │  │
│  └──────────────────┘    │  ┌──────────┐  ┌──────────┐  │  │
│                          │  │  Lambda  │  │ DynamoDB │  │  │
│                          │  │  Indexer │──│ VPC EP   │  │  │
│                          │  └──────────┘  └──────────┘  │  │
│                          └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Security Groups

```yaml
# OpenSearch Security Group
resource "aws_security_group" "opensearch" {
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id, aws_security_group.indexer.id]
  }
  # No egress needed for OpenSearch
}
```

### VPC Endpoints (No Public Internet)

- `com.amazonaws.us-east-1.dynamodb` (Gateway)
- `com.amazonaws.us-east-1.ssm` (Interface)
- `com.amazonaws.us-east-1.logs` (Interface)
- OpenSearch domain with VPC access

---

## IAM Security

### Role Separation

| Role | Permissions | Scope |
|------|-------------|-------|
| `MemberSearchApiRole` | SSM read, OpenSearch query | API only |
| `MemberSearchIndexerRole` | DynamoDB streams, OpenSearch write, SQS | Indexer only |
| `MemberSearchDeployRole` | ECS deploy, Lambda update | CI/CD only |

### Least Privilege Example (API Role)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OpenSearchQuery",
      "Effect": "Allow",
      "Action": ["es:ESHttpGet", "es:ESHttpPost"],
      "Resource": "arn:aws:es:*:*:domain/membersearch/*"
    },
    {
      "Sid": "SSMRead",
      "Effect": "Allow",
      "Action": ["ssm:GetParameter"],
      "Resource": "arn:aws:ssm:*:*:parameter/membersearch/prod/*"
    },
    {
      "Sid": "KMSDecrypt",
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "arn:aws:kms:*:*:key/<key-id>",
      "Condition": {
        "StringEquals": {"kms:ViaService": "ssm.us-east-1.amazonaws.com"}
      }
    }
  ]
}
```

---

## Authentication & Authorization

### JWT Validation

```typescript
// jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ['RS256'],
      secretOrKeyProvider: jwksClient.getKey,  // Cognito JWKS
    });
  }
}
```

### RBAC Field Filtering

```typescript
// search.service.ts
private getSourceFilter(user: AuthenticatedUser): string[] {
  const baseFields = ['member_id', 'email', 'fname', 'lname', 'tags', 'tenant_id'];
  
  if (user.tenantType === 'external') {
    return user.roles.includes('admin') ? [...baseFields, 'status_notes'] : baseFields;
  }
  
  if (user.roles.includes('compliance_lead')) {
    return [...baseFields, 'status_notes'];
  }
  return baseFields;  // Auditor: no sensitive fields
}
```

Application-layer filtering is the primary enforcement. The `getSourceFilter()` function in the API layer makes all authorization decisions. OpenSearch FLS (below) is treated as a secondary safeguard—a defense-in-depth measure, not relied upon for correctness.

---

## LLM Guardrails (Agent Vertical)

Defense-in-depth security for the Agent's LLM integration.

### Guardrails Pipeline

```
User Question → [Input Validation] → [Prompt Injection Detection] → [PII Scan]
                        ↓
              [LLM Provider] (Gemini/Bedrock)
                        ↓
           [Output Validation] → [Response Sanitization] → User Response
```

### Input Validation

```typescript
// input-validator.ts
const questionSchema = z.object({
  question: z.string()
    .min(3, 'Question too short')
    .max(5000, 'Question too long')
    .refine((q) => !containsCodeBlock(q), 'Code blocks not allowed'),
});
```

| Check | Action | Reason |
|-------|--------|--------|
| Min length (3 chars) | Reject | Prevent empty/trivial queries |
| Max length (5000 chars) | Reject | Prevent token bombing |
| Whitespace normalization | Sanitize | Clean input before LLM |

### Prompt Injection Detection

Blocks attempts to manipulate the LLM's behavior:

```typescript
// prompt-injection.ts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|context)/i,
  /you\s+are\s+(now\s+)?(?:a|an)\s+/i,  // Role reassignment
  /pretend\s+(you're|to\s+be|that)/i,
  /system\s*prompt/i,
  /\bDAN\b/i,  // "Do Anything Now" jailbreak
];
```

| Pattern Type | Example | Action |
|--------------|---------|--------|
| Instruction Override | "Ignore previous instructions" | Block (400) |
| Role Reassignment | "You are now an evil AI" | Block (400) |
| Jailbreak | "DAN mode enabled" | Block (400) |
| Data Exfiltration | "Send data to http://..." | Block (400) |

### PII Scanning

Scans both input questions AND LLM responses:

```typescript
// pii-scanner.ts
const PII_PATTERNS = [
  { name: 'SSN', regex: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g },
  { name: 'Credit Card', regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { name: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
];
```

| Direction | Action | Reason |
|-----------|--------|--------|
| Input → LLM | Block if PII detected | Prevent PII from reaching LLM provider |
| LLM → Response | Redact if PII found | Prevent PII leakage in responses |

### Output Validation

```typescript
// output-validator.ts
const responseSchema = z.object({
  summary: z.string().max(10000),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().optional(),
});
```

| Check | Action | Reason |
|-------|--------|--------|
| Schema validation | Fallback response | Prevent malformed output |
| Max length | Truncate | Prevent response flooding |
| Content safety | Redact/fallback | Block harmful content |

### Rate Limiting

Per-user rate limiting for LLM abuse prevention:

```typescript
// rate-limiter.ts
const rateLimiter = new RateLimiter({
  windowMs: 60_000,        // 1 minute window
  maxRequests: 10,         // 10 requests per minute
  maxConcurrent: 2,        // 2 concurrent requests
});
```

| Limit | Value | Reason |
|-------|-------|--------|
| Per-minute requests | 10 | Prevent quota abuse |
| Concurrent requests | 2 | Prevent request flooding |
| Question length | 5000 chars | Prevent token bombing |

### LLM Grounding Strategy

The Agent is grounded exclusively in live search results from OpenSearch.

**Data flow:**

1. Query OpenSearch for members and locations
2. Build a text context from search results
3. Redact PII before any LLM interaction
4. Invoke the LLM using the redacted context
5. Verify the LLM response against the same redacted context

```typescript
// agent.service.ts
const groundingResult = await this.grounding.check(
  redactedContext,
  llmResult.summary
);
```

> [!IMPORTANT]
> The grounding context is NOT a curated summary store. It is the live, redacted search results that the LLM received.

### Grounding Verification

Validates that LLM responses are factually grounded in source data (prevents hallucinations):

```typescript
// grounding.service.ts
async check(context: string, response: string): Promise<GroundingResult> {
    const auditResult = await this.llmProvider.analyze('Grounding Audit', prompt);
    return {
        grounded: parsed.grounded && parsed.score >= 0.8,
        score: parsed.score,
        reason: parsed.reason,
    };
}
```

| Score | Meaning |
|-------|---------|
| 0.9-1.0 | Every claim directly supported by facts |
| 0.8-0.9 | Claims mostly supported, minor inferences |
| 0.5-0.7 | Some claims lack direct support |
| 0.0-0.4 | Significant claims unsupported/fabricated |

### LLM Provider Security

| Provider | Authentication | Key Storage |
|----------|---------------|-------------|
| Gemini (local) | API Key | `.env.local` (gitignored) |
| Bedrock (production) | IAM Task Role | No keys needed |

**Production Bedrock IAM Policy:**
```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": [
    "arn:aws:bedrock:*:*:foundation-model/anthropic.claude*",
    "arn:aws:bedrock:*:*:foundation-model/amazon.titan*"
  ]
}
```

---

## PII Protection

### Pre-Index Redaction

```typescript
// redaction.service.ts
const PII_PATTERNS = [
  { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE-REDACTED]' },
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },
];
```

### OpenSearch Field-Level Security (Defense-in-Depth)

FLS is a secondary safeguard. All authorization decisions are enforced in the API layer. If FLS is misconfigured, the application still protects sensitive fields.

```json
{
  "index_permissions": [{
    "index_patterns": ["members"],
    "fls": ["~status_notes"],
    "allowed_actions": ["read"]
  }]
}
```
```

---

## Audit Logging

### CloudTrail

- API Gateway requests (who accessed what)
- IAM role assumptions
- SSM parameter reads
- KMS decryptions

### Application Audit Log

```typescript
// audit.interceptor.ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    
    this.logger.info({
      event: 'SEARCH_REQUEST',
      userId: user.sub,
      role: user['cognito:groups']?.[0],
      query: req.query.q,
      timestamp: new Date().toISOString(),
    });
    
    return next.handle();
  }
}
```

---

## Security Checklist

### Infrastructure
- [ ] All secrets in SSM Parameter Store (SecureString)
- [ ] KMS CMK with key rotation enabled
- [ ] DynamoDB encryption at rest enabled
- [ ] OpenSearch encryption at rest + node-to-node
- [ ] VPC endpoints for all AWS services (no public internet)
- [ ] Security groups with minimal ingress
- [ ] TLS 1.2+ enforced everywhere

### Authentication & Authorization
- [ ] IAM roles with least privilege
- [ ] JWT validation with Cognito JWKS
- [ ] RBAC field filtering enforced in API layer

### Data Protection
- [ ] PII redaction before indexing
- [ ] CloudTrail enabled for audit

### LLM Guardrails (Agent Vertical)
- [ ] Input validation (length, format)
- [ ] Prompt injection detection enabled
- [ ] PII scanning on input AND output
- [ ] Output schema validation
- [ ] Per-user rate limiting
- [ ] Bedrock IAM authentication (no API keys in production)

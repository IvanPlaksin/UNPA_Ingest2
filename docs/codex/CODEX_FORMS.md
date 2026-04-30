# CODEX: FormDefinition — AI Agent Instructions

## Overview

FormDefinition — structured description of a dynamic form in Knowledge Base.
AI Agent creates FormDefinition graphs in Memgraph (namespace: CORE) on user request.
Forms are rendered by `FormRenderer` component and integrated with `workflow.wait_input` executor for async signal system.

---

## Graph Structure

### Node Types

```
FormDefinition (root)
  └── FormSection (1..n)
        └── FormField (1..n)
              ├── ValidationRule (0..n)
              ├── DisplayCondition (0..n)
              └── DataSourceDefinition (0..1, via edge)
```

### Required Properties

#### FormDefinition
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| id | string | ✓ | UUID, auto-generated |
| name | string | ✓ | Human-readable name |
| description | string | | Form purpose description |
| version | string | | Semver (default: "1.0.0") |
| status | enum | ✓ | ACTIVE, DRAFT, ARCHIVED |
| namespace | string | ✓ | Always "CORE" for forms |

#### FormSection
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| id | string | ✓ | UUID |
| title | string | ✓ | Section header |
| order | number | ✓ | Display order (0-based) |
| collapsible | boolean | | Default: false |
| description | string | | Section help text |

#### FormField
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| id | string | ✓ | UUID |
| name | string | ✓ | Field identifier (snake_case) |
| type | enum | ✓ | See Field Types below |
| label | string | ✓ | Display label |
| required | boolean | | Default: false |
| placeholder | string | | Input placeholder |
| defaultValue | any | | Default value |
| order | number | ✓ | Display order within section |

### Field Types

| Type | JSON Schema | Use Case |
|------|-------------|----------|
| text | string | Short text input |
| textarea | string | Multi-line text |
| number | number | Numeric input |
| email | string (format: email) | Email address |
| url | string (format: uri) | URL input |
| date | string (format: date) | Date picker |
| datetime | string (format: date-time) | DateTime picker |
| boolean | boolean | Checkbox |
| select | string (enum) | Single selection dropdown |
| multiselect | array | Multiple selection |
| autocomplete | string | Search-as-you-type |
| file | string (base64) | File upload |
| hidden | string | Hidden field |

### ValidationRule

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| id | string | ✓ | UUID |
| ruleType | enum | ✓ | REQUIRED, REGEX, RANGE, LENGTH, ENUM, EXPRESSION |
| expression | string | ✓ | Rule expression |
| engine | enum | | PREDICATE (default) or JSONATA |
| message | string | ✓ | Error message |
| severity | enum | | ERROR (default), WARNING |

### DisplayCondition

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| id | string | ✓ | UUID |
| expression | string | ✓ | Predicate expression |
| engine | enum | | PREDICATE (default) |
| effect | enum | ✓ | SHOW, HIDE, DISABLE, ENABLE |

### Edge Types

| Edge | From | To | Description |
|------|------|-----|-------------|
| HAS_SECTION | FormDefinition | FormSection | Contains section |
| HAS_FIELD | FormSection | FormField | Contains field |
| HAS_VALIDATION | FormField | ValidationRule | Field validation |
| HAS_DISPLAY_CONDITION | FormField | DisplayCondition | Conditional visibility |
| USES_DATA_SOURCE | FormField | DataSourceDefinition | Dynamic options |

---

## AI Agent Instructions

### When to Create FormDefinition

Create FormDefinition when user requests:
- "Create a form for..."
- "I need an approval form"
- "Build a data entry form"
- "Design a survey for..."

### Creation Process

1. **Analyze Requirements**
   - Identify all fields needed
   - Determine field types
   - Identify validation rules
   - Identify conditional logic

2. **Structure Sections**
   - Group related fields into sections
   - Order sections logically
   - Add descriptive titles

3. **Define Fields**
   - Use semantic field names (snake_case)
   - Choose appropriate field types
   - Set required flags
   - Add helpful placeholders

4. **Add Validations**
   - Required fields → REQUIRED rule
   - Format constraints → REGEX rule
   - Numeric limits → RANGE rule
   - Text limits → LENGTH rule
   - Complex logic → EXPRESSION rule

5. **Add Conditions**
   - Dependent fields → DisplayCondition
   - Use SHOW/HIDE effects

6. **Link Data Sources**
   - Dropdowns with dynamic data → USES_DATA_SOURCE

### Graph Creation Format

Use GXE ACTION block format:

```
%%ACTION%%
{
  "action": "CREATE_GRAPH",
  "graph": {
    "id": "form-<uuid>",
    "name": "<form-name>",
    "namespace": "CORE",
    "nodes": [...],
    "edges": [...]
  }
}
%%END_ACTION%%
```

---

## Examples

### Example 1: Purchase Approval Form

**User Request:** "Create an approval form for purchase requests"

```
%%ACTION%%
{
  "action": "CREATE_GRAPH",
  "graph": {
    "id": "form-purchase-approval",
    "name": "Purchase Request Approval",
    "namespace": "CORE",
    "nodes": [
      {
        "id": "fd-1",
        "type": "FormDefinition",
        "properties": {
          "id": "purchase-approval-form",
          "name": "Purchase Request Approval",
          "description": "Form for approving or rejecting purchase requests",
          "version": "1.0.0",
          "status": "ACTIVE",
          "namespace": "CORE"
        }
      },
      {
        "id": "fs-1",
        "type": "FormSection",
        "properties": {
          "id": "section-decision",
          "title": "Approval Decision",
          "order": 0,
          "collapsible": false
        }
      },
      {
        "id": "ff-1",
        "type": "FormField",
        "properties": {
          "id": "field-decision",
          "name": "decision",
          "type": "select",
          "label": "Decision",
          "required": true,
          "order": 0,
          "options": [
            {"value": "APPROVE", "label": "Approve"},
            {"value": "REJECT", "label": "Reject"},
            {"value": "REQUEST_INFO", "label": "Request More Information"}
          ]
        }
      },
      {
        "id": "ff-2",
        "type": "FormField",
        "properties": {
          "id": "field-comments",
          "name": "comments",
          "type": "textarea",
          "label": "Comments",
          "required": false,
          "placeholder": "Add any comments or notes",
          "order": 1
        }
      },
      {
        "id": "ff-3",
        "type": "FormField",
        "properties": {
          "id": "field-rejection-reason",
          "name": "rejection_reason",
          "type": "textarea",
          "label": "Rejection Reason",
          "required": true,
          "placeholder": "Please explain why this request is being rejected",
          "order": 2
        }
      },
      {
        "id": "dc-1",
        "type": "DisplayCondition",
        "properties": {
          "id": "cond-show-rejection",
          "expression": "decision == 'REJECT'",
          "engine": "PREDICATE",
          "effect": "SHOW"
        }
      },
      {
        "id": "vr-1",
        "type": "ValidationRule",
        "properties": {
          "id": "val-rejection-length",
          "ruleType": "LENGTH",
          "expression": "10-1000",
          "message": "Rejection reason must be between 10 and 1000 characters"
        }
      }
    ],
    "edges": [
      {"from": "fd-1", "to": "fs-1", "type": "HAS_SECTION"},
      {"from": "fs-1", "to": "ff-1", "type": "HAS_FIELD"},
      {"from": "fs-1", "to": "ff-2", "type": "HAS_FIELD"},
      {"from": "fs-1", "to": "ff-3", "type": "HAS_FIELD"},
      {"from": "ff-3", "to": "dc-1", "type": "HAS_DISPLAY_CONDITION"},
      {"from": "ff-3", "to": "vr-1", "type": "HAS_VALIDATION"}
    ]
  }
}
%%END_ACTION%%
```

### Example 2: Employee Onboarding Form

**User Request:** "Create an employee onboarding form with personal info, employment details, and emergency contact"

```
%%ACTION%%
{
  "action": "CREATE_GRAPH",
  "graph": {
    "id": "form-employee-onboarding",
    "name": "Employee Onboarding",
    "namespace": "CORE",
    "nodes": [
      {
        "id": "fd-1", "type": "FormDefinition",
        "properties": {
          "id": "employee-onboarding-form", "name": "Employee Onboarding",
          "description": "New employee information collection", "status": "ACTIVE", "namespace": "CORE"
        }
      },
      {
        "id": "fs-1", "type": "FormSection",
        "properties": { "id": "section-personal", "title": "Personal Information", "order": 0 }
      },
      {
        "id": "fs-2", "type": "FormSection",
        "properties": { "id": "section-employment", "title": "Employment Details", "order": 1 }
      },
      {
        "id": "fs-3", "type": "FormSection",
        "properties": { "id": "section-emergency", "title": "Emergency Contact", "order": 2, "collapsible": true }
      },
      {
        "id": "ff-1", "type": "FormField",
        "properties": { "id": "f-first-name", "name": "first_name", "type": "text", "label": "First Name", "required": true, "order": 0 }
      },
      {
        "id": "ff-2", "type": "FormField",
        "properties": { "id": "f-last-name", "name": "last_name", "type": "text", "label": "Last Name", "required": true, "order": 1 }
      },
      {
        "id": "ff-3", "type": "FormField",
        "properties": { "id": "f-email", "name": "email", "type": "email", "label": "Email Address", "required": true, "order": 2 }
      },
      {
        "id": "ff-4", "type": "FormField",
        "properties": { "id": "f-dob", "name": "date_of_birth", "type": "date", "label": "Date of Birth", "required": true, "order": 3 }
      },
      {
        "id": "ff-5", "type": "FormField",
        "properties": { "id": "f-department", "name": "department", "type": "select", "label": "Department", "required": true, "order": 0, "dataSourceId": "ds-departments" }
      },
      {
        "id": "ff-6", "type": "FormField",
        "properties": { "id": "f-position", "name": "position", "type": "text", "label": "Position Title", "required": true, "order": 1 }
      },
      {
        "id": "ff-7", "type": "FormField",
        "properties": { "id": "f-start-date", "name": "start_date", "type": "date", "label": "Start Date", "required": true, "order": 2 }
      },
      {
        "id": "ff-8", "type": "FormField",
        "properties": { "id": "f-ec-name", "name": "emergency_contact_name", "type": "text", "label": "Contact Name", "required": true, "order": 0 }
      },
      {
        "id": "ff-9", "type": "FormField",
        "properties": { "id": "f-ec-phone", "name": "emergency_contact_phone", "type": "text", "label": "Contact Phone", "required": true, "order": 1 }
      },
      {
        "id": "ff-10", "type": "FormField",
        "properties": { "id": "f-ec-relation", "name": "emergency_contact_relationship", "type": "select", "label": "Relationship", "required": true, "order": 2, "options": [
          {"value": "spouse", "label": "Spouse"},
          {"value": "parent", "label": "Parent"},
          {"value": "sibling", "label": "Sibling"},
          {"value": "friend", "label": "Friend"},
          {"value": "other", "label": "Other"}
        ]}
      },
      {
        "id": "vr-email", "type": "ValidationRule",
        "properties": { "id": "val-email-format", "ruleType": "REGEX", "expression": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", "message": "Please enter a valid email address" }
      }
    ],
    "edges": [
      {"from": "fd-1", "to": "fs-1", "type": "HAS_SECTION"},
      {"from": "fd-1", "to": "fs-2", "type": "HAS_SECTION"},
      {"from": "fd-1", "to": "fs-3", "type": "HAS_SECTION"},
      {"from": "fs-1", "to": "ff-1", "type": "HAS_FIELD"},
      {"from": "fs-1", "to": "ff-2", "type": "HAS_FIELD"},
      {"from": "fs-1", "to": "ff-3", "type": "HAS_FIELD"},
      {"from": "fs-1", "to": "ff-4", "type": "HAS_FIELD"},
      {"from": "fs-2", "to": "ff-5", "type": "HAS_FIELD"},
      {"from": "fs-2", "to": "ff-6", "type": "HAS_FIELD"},
      {"from": "fs-2", "to": "ff-7", "type": "HAS_FIELD"},
      {"from": "fs-3", "to": "ff-8", "type": "HAS_FIELD"},
      {"from": "fs-3", "to": "ff-9", "type": "HAS_FIELD"},
      {"from": "fs-3", "to": "ff-10", "type": "HAS_FIELD"},
      {"from": "ff-3", "to": "vr-email", "type": "HAS_VALIDATION"}
    ]
  }
}
%%END_ACTION%%
```

---

## Validation Rules Reference

### REQUIRED
```json
{
  "ruleType": "REQUIRED",
  "expression": "",
  "message": "This field is required"
}
```

### REGEX (email)
```json
{
  "ruleType": "REGEX",
  "expression": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
  "message": "Please enter a valid email address"
}
```

### RANGE (numeric)
```json
{
  "ruleType": "RANGE",
  "expression": "0-100",
  "message": "Value must be between 0 and 100"
}
```

### LENGTH (text)
```json
{
  "ruleType": "LENGTH",
  "expression": "5-500",
  "message": "Must be between 5 and 500 characters"
}
```

### EXPRESSION (complex)
```json
{
  "ruleType": "EXPRESSION",
  "expression": "end_date > start_date",
  "engine": "PREDICATE",
  "message": "End date must be after start date"
}
```

---

## DisplayCondition Patterns

### Show field when another has specific value
```json
{
  "expression": "status == 'OTHER'",
  "effect": "SHOW"
}
```

### Hide field when checkbox unchecked
```json
{
  "expression": "has_previous_experience == false",
  "effect": "HIDE"
}
```

### Show section based on multiple conditions
```json
{
  "expression": "role == 'MANAGER' and department != 'HR'",
  "effect": "SHOW"
}
```

---

## Common Patterns

### Approval Forms
- Decision field (select: APPROVE/REJECT/etc)
- Comments field (always visible)
- Rejection reason (conditional, required when REJECT)
- Conditions requiring justification

### Data Entry Forms
- Multiple sections by category
- Required fields for core data
- Optional fields for extended data
- Format validations (email, phone, URL)

### Survey Forms
- Rating scales (number with RANGE)
- Multiple choice (select/multiselect)
- Open-ended feedback (textarea)
- Conditional follow-up questions

### Request Forms
- Requester info (often prefilled from context)
- Request details
- Justification
- Priority/urgency selection
- Attachments (file field)

---

## Best Practices

1. **Field Naming** — Use snake_case: `first_name`, not `firstName`. Be descriptive: `rejection_reason`, not `reason`.
2. **Sections** — Group logically related fields. Limit to 5-7 fields per section. Use clear titles.
3. **Validation** — Always mark truly required fields. Provide helpful error messages.
4. **Conditions** — Keep expressions simple. Test with edge cases.
5. **UX** — Logical field ordering. Helpful placeholders. Sensible defaults where appropriate.

---

## Integration with wait_input

When creating forms for use with `workflow.wait_input` executor:

1. Note the FormDefinition ID
2. In the wait_input node config, reference it:

```json
{
  "toolId": "workflow.wait_input",
  "config": {
    "formId": "purchase-approval-form",
    "recipients": ["approver@company.com"],
    "contextMessage": "Please review the purchase request",
    "timeoutHours": 72,
    "timeoutAction": "ESCALATE"
  }
}
```

The form will be rendered via FormRenderer when the signal is activated.

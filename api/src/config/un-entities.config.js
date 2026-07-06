/**
 * UN-Specific Entity Configuration
 *
 * Defines regex patterns, entity types, and extraction rules for
 * United Nations domain-specific entities.
 *
 * @module config/un-entities
 */

/**
 * UN Systems - Major enterprise systems used across UN organizations
 */
const UN_SYSTEMS = {
  // Core ERP Systems
  UMOJA: {
    name: 'Umoja',
    pattern: /\b(Umoja|UMOJA)\b/gi,
    description: 'UN ERP System (SAP-based)',
    category: 'ERP'
  },
  IMIS: {
    name: 'IMIS',
    pattern: /\b(IMIS|Integrated Management Information System)\b/gi,
    description: 'Legacy Integrated Management Information System',
    category: 'Legacy'
  },
  INSPIRA: {
    name: 'Inspira',
    pattern: /\b(Inspira|INSPIRA)\b/gi,
    description: 'UN Talent Management System',
    category: 'HR'
  },

  // Travel & Finance
  UNITE_TRAVEL: {
    name: 'Unite Travel',
    pattern: /\b(Unite\s*Travel|UNITE\s*TRAVEL)\b/gi,
    description: 'UN Travel Management System',
    category: 'Travel'
  },
  IPSAS: {
    name: 'IPSAS',
    pattern: /\b(IPSAS|International Public Sector Accounting Standards)\b/gi,
    description: 'Accounting Standards',
    category: 'Finance'
  },

  // Document Management
  EDMS: {
    name: 'EDMS',
    pattern: /\b(EDMS|Electronic Document Management System)\b/gi,
    description: 'Electronic Document Management System',
    category: 'Documents'
  },
  ODS: {
    name: 'ODS',
    pattern: /\b(ODS|Official Document System)\b/gi,
    description: 'Official Document System',
    category: 'Documents'
  },

  // Collaboration
  UNITE_DOCS: {
    name: 'Unite Docs',
    pattern: /\b(Unite\s*Docs|UNITE\s*DOCS)\b/gi,
    description: 'UN Document Collaboration Platform',
    category: 'Collaboration'
  },
  TEAMS: {
    name: 'MS Teams',
    pattern: /\b(Microsoft\s*Teams|MS\s*Teams|Teams)\b/gi,
    description: 'Microsoft Teams',
    category: 'Collaboration'
  },

  // Identity & Access
  UNITE_ID: {
    name: 'Unite ID',
    pattern: /\b(Unite\s*ID|UNITE\s*ID|UN\s*ID)\b/gi,
    description: 'UN Identity Management',
    category: 'Identity'
  },
  AD: {
    name: 'Active Directory',
    pattern: /\b(Active\s*Directory|AD|Azure\s*AD|AAD)\b/gi,
    description: 'Active Directory',
    category: 'Identity'
  },

  // Development
  TFS: {
    name: 'TFS',
    pattern: /\b(TFS|Team Foundation Server|TFVC)\b/gi,
    description: 'Team Foundation Server',
    category: 'DevOps'
  },
  ADO: {
    name: 'Azure DevOps',
    pattern: /\b(Azure\s*DevOps|ADO|VSTS|Visual\s*Studio\s*Team\s*Services)\b/gi,
    description: 'Azure DevOps',
    category: 'DevOps'
  }
};

/**
 * UN Document Reference Patterns
 * Official UN document numbering schemes
 */
const UN_DOCUMENT_PATTERNS = {
  // ST/AI - Administrative Instructions
  ST_AI: {
    name: 'Administrative Instruction',
    pattern: /\bST\/AI\/(\d{4})\/(\d+)(?:\/\w+)?\b/gi,
    example: 'ST/AI/2023/1',
    category: 'Administrative'
  },

  // ST/SGB - Secretary-General's Bulletins
  ST_SGB: {
    name: "Secretary-General's Bulletin",
    pattern: /\bST\/SGB\/(\d{4})\/(\d+)(?:\/\w+)?\b/gi,
    example: 'ST/SGB/2019/2',
    category: 'Policy'
  },

  // ST/IC - Information Circulars
  ST_IC: {
    name: 'Information Circular',
    pattern: /\bST\/IC\/(\d{4})\/(\d+)\b/gi,
    example: 'ST/IC/2023/15',
    category: 'Information'
  },

  // A/RES - General Assembly Resolutions
  A_RES: {
    name: 'GA Resolution',
    pattern: /\bA\/RES\/(\d+)\/(\d+)\b/gi,
    example: 'A/RES/77/1',
    category: 'Resolution'
  },

  // A/C.5 - Fifth Committee Documents
  A_C5: {
    name: 'Fifth Committee Document',
    pattern: /\bA\/C\.5\/(\d+)\/(\d+)\b/gi,
    example: 'A/C.5/77/1',
    category: 'Committee'
  },

  // S/RES - Security Council Resolutions
  S_RES: {
    name: 'SC Resolution',
    pattern: /\bS\/RES\/(\d+)\s*\((\d{4})\)\b/gi,
    example: 'S/RES/2665 (2022)',
    category: 'Resolution'
  },

  // General UN Symbol Pattern
  UN_SYMBOL: {
    name: 'UN Document Symbol',
    pattern: /\b([A-Z]+(?:\/[A-Z0-9.]+)+)\b/g,
    example: 'A/77/6/Add.1',
    category: 'General'
  }
};

/**
 * UN Organizations and Departments
 */
const UN_ORGANIZATIONS = {
  // Secretariat Departments
  OICT: {
    name: 'OICT',
    fullName: 'Office of Information and Communications Technology',
    pattern: /\b(OICT|Office of Information and Communications Technology)\b/gi,
    category: 'Department'
  },
  DOS: {
    name: 'DOS',
    fullName: 'Department of Operational Support',
    pattern: /\b(DOS|Department of Operational Support|DFS)\b/gi,
    category: 'Department'
  },
  DFS: {
    name: 'DFS',
    fullName: 'Department of Field Support (legacy)',
    pattern: /\b(DFS|Department of Field Support)\b/gi,
    category: 'Department'
  },
  DGACM: {
    name: 'DGACM',
    fullName: 'Department for General Assembly and Conference Management',
    pattern: /\b(DGACM|Department for General Assembly)\b/gi,
    category: 'Department'
  },
  DMSPC: {
    name: 'DMSPC',
    fullName: 'Department of Management Strategy, Policy and Compliance',
    pattern: /\b(DMSPC|Department of Management Strategy)\b/gi,
    category: 'Department'
  },
  DPPA: {
    name: 'DPPA',
    fullName: 'Department of Political and Peacebuilding Affairs',
    pattern: /\b(DPPA|Department of Political)\b/gi,
    category: 'Department'
  },
  DPO: {
    name: 'DPO',
    fullName: 'Department of Peace Operations',
    pattern: /\b(DPO|Department of Peace Operations|DPKO)\b/gi,
    category: 'Department'
  },

  // UN Agencies
  UNDP: {
    name: 'UNDP',
    fullName: 'United Nations Development Programme',
    pattern: /\b(UNDP|United Nations Development Programme)\b/gi,
    category: 'Agency'
  },
  UNICEF: {
    name: 'UNICEF',
    fullName: "United Nations Children's Fund",
    pattern: /\b(UNICEF)\b/gi,
    category: 'Agency'
  },
  WFP: {
    name: 'WFP',
    fullName: 'World Food Programme',
    pattern: /\b(WFP|World Food Programme)\b/gi,
    category: 'Agency'
  },
  UNHCR: {
    name: 'UNHCR',
    fullName: 'United Nations High Commissioner for Refugees',
    pattern: /\b(UNHCR|UN Refugee Agency)\b/gi,
    category: 'Agency'
  },

  // Locations
  UNHQ: {
    name: 'UNHQ',
    fullName: 'UN Headquarters',
    pattern: /\b(UNHQ|UN Headquarters|United Nations Headquarters)\b/gi,
    category: 'Location'
  },
  UNOG: {
    name: 'UNOG',
    fullName: 'UN Office at Geneva',
    pattern: /\b(UNOG|UN Geneva)\b/gi,
    category: 'Location'
  },
  UNOV: {
    name: 'UNOV',
    fullName: 'UN Office at Vienna',
    pattern: /\b(UNOV|UN Vienna)\b/gi,
    category: 'Location'
  },
  UNON: {
    name: 'UNON',
    fullName: 'UN Office at Nairobi',
    pattern: /\b(UNON|UN Nairobi)\b/gi,
    category: 'Location'
  }
};

/**
 * Work Item Reference Patterns
 * Azure DevOps and legacy TFS work item references
 */
const WORK_ITEM_PATTERNS = {
  // Standard WI reference: #12345
  HASH_REF: {
    name: 'Hash Reference',
    pattern: /#(\d{4,6})\b/g,
    example: '#12345'
  },

  // WI-12345 format
  WI_PREFIX: {
    name: 'WI Prefix',
    pattern: /\bWI[-_]?(\d{4,6})\b/gi,
    example: 'WI-12345'
  },

  // Work Item 12345
  FULL_REF: {
    name: 'Full Reference',
    pattern: /\bWork\s*Item\s*#?(\d{4,6})\b/gi,
    example: 'Work Item 12345'
  },

  // Bug/Task/Story/Feature references
  TYPE_REF: {
    name: 'Type Reference',
    pattern: /\b(Bug|Task|Story|Feature|Epic|PBI)\s*#?(\d{4,6})\b/gi,
    example: 'Bug #12345'
  },

  // ADO URL pattern
  ADO_URL: {
    name: 'ADO URL',
    pattern: /dev\.azure\.com\/[^\/]+\/[^\/]+\/_workitems\/edit\/(\d+)/gi,
    example: 'dev.azure.com/org/project/_workitems/edit/12345'
  }
};

/**
 * Person/Staff Patterns
 */
const PERSON_PATTERNS = {
  // Email pattern (UN domain)
  UN_EMAIL: {
    name: 'UN Email',
    pattern: /\b([a-zA-Z0-9._%+-]+@(?:un\.org|unicef\.org|undp\.org|wfp\.org|unhcr\.org))\b/gi,
    category: 'Email'
  },

  // Staff ID pattern (typically 6-8 digits)
  STAFF_ID: {
    name: 'Staff ID',
    pattern: /\b(?:Staff\s*ID|Index\s*No\.?)\s*:?\s*(\d{6,8})\b/gi,
    category: 'ID'
  },

  // Name with title
  TITLED_NAME: {
    name: 'Titled Name',
    pattern: /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
    category: 'Name'
  }
};

/**
 * Technical Patterns
 */
const TECHNICAL_PATTERNS = {
  // File paths (Windows/Unix)
  FILE_PATH: {
    name: 'File Path',
    pattern: /(?:\/[\w.-]+)+\/[\w.-]+\.\w+|(?:[A-Z]:\\[\w\\.-]+)+/g,
    category: 'Path'
  },

  // Database objects
  DB_OBJECT: {
    name: 'Database Object',
    pattern: /\b(dbo|schema)\.(\w+)\b|\b(\w+)\.(\w+)\.(\w+)\b/gi,
    category: 'Database'
  },

  // API endpoints
  API_ENDPOINT: {
    name: 'API Endpoint',
    pattern: /\/api\/v?\d*\/[\w\/-]+/g,
    category: 'API'
  },

  // Version numbers
  VERSION: {
    name: 'Version',
    pattern: /\b[vV]?(\d+)\.(\d+)(?:\.(\d+))?(?:-[a-zA-Z0-9]+)?\b/g,
    category: 'Version'
  },

  // IP addresses
  IP_ADDRESS: {
    name: 'IP Address',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    category: 'Network'
  },

  // SQL queries keywords
  SQL_KEYWORDS: {
    name: 'SQL Keywords',
    pattern: /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|ORDER BY|HAVING)\b/gi,
    category: 'SQL'
  }
};

/**
 * Extended Technology Patterns - Modern polystore technologies
 * Added to improve entity extraction for contemporary tech stack
 */
const EXTENDED_TECHNOLOGY_PATTERNS = {
  // === DATABASES ===
  DATABASES: {
    graph: {
      MEMGRAPH: {
        name: 'Memgraph',
        pattern: /\b(Memgraph)\b/gi,
        category: 'Database',
        subType: 'graph',
        confidence: 0.95
      },
      NEO4J: {
        name: 'Neo4j',
        pattern: /\b(Neo4j|neo4j)\b/gi,
        category: 'Database',
        subType: 'graph',
        confidence: 0.95
      },
      ARANGODB: {
        name: 'ArangoDB',
        pattern: /\b(ArangoDB|Arango)\b/gi,
        category: 'Database',
        subType: 'graph',
        confidence: 0.90
      },
      JANUSGRAPH: {
        name: 'JanusGraph',
        pattern: /\b(JanusGraph|Janus\s*Graph)\b/gi,
        category: 'Database',
        subType: 'graph',
        confidence: 0.90
      }
    },
    vector: {
      QDRANT: {
        name: 'Qdrant',
        pattern: /\b(Qdrant)\b/gi,
        category: 'Database',
        subType: 'vector',
        confidence: 0.95
      },
      PINECONE: {
        name: 'Pinecone',
        pattern: /\b(Pinecone)\b/gi,
        category: 'Database',
        subType: 'vector',
        confidence: 0.95
      },
      MILVUS: {
        name: 'Milvus',
        pattern: /\b(Milvus)\b/gi,
        category: 'Database',
        subType: 'vector',
        confidence: 0.90
      },
      WEAVIATE: {
        name: 'Weaviate',
        pattern: /\b(Weaviate)\b/gi,
        category: 'Database',
        subType: 'vector',
        confidence: 0.90
      },
      CHROMADB: {
        name: 'ChromaDB',
        pattern: /\b(ChromaDB|Chroma)\b/gi,
        category: 'Database',
        subType: 'vector',
        confidence: 0.90
      },
      FAISS: {
        name: 'FAISS',
        pattern: /\b(FAISS)\b/g,
        category: 'Database',
        subType: 'vector',
        confidence: 0.90
      }
    },
    cache: {
      REDIS: {
        name: 'Redis',
        pattern: /\b(Redis)\b/gi,
        category: 'Database',
        subType: 'cache',
        confidence: 0.95
      },
      MEMCACHED: {
        name: 'Memcached',
        pattern: /\b(Memcached|memcached)\b/gi,
        category: 'Database',
        subType: 'cache',
        confidence: 0.90
      }
    },
    relational: {
      POSTGRESQL: {
        name: 'PostgreSQL',
        pattern: /\b(PostgreSQL|Postgres|psql)\b/gi,
        category: 'Database',
        subType: 'relational',
        confidence: 0.95
      },
      MYSQL: {
        name: 'MySQL',
        pattern: /\b(MySQL)\b/gi,
        category: 'Database',
        subType: 'relational',
        confidence: 0.95
      },
      SQLSERVER: {
        name: 'SQL Server',
        pattern: /\b(SQL\s*Server|MSSQL|Microsoft\s*SQL)\b/gi,
        category: 'Database',
        subType: 'relational',
        confidence: 0.95
      }
    },
    document: {
      MONGODB: {
        name: 'MongoDB',
        pattern: /\b(MongoDB|Mongo)\b/gi,
        category: 'Database',
        subType: 'document',
        confidence: 0.95
      },
      COUCHDB: {
        name: 'CouchDB',
        pattern: /\b(CouchDB|Couch)\b/gi,
        category: 'Database',
        subType: 'document',
        confidence: 0.90
      }
    },
    search: {
      ELASTICSEARCH: {
        name: 'Elasticsearch',
        pattern: /\b(Elasticsearch|Elastic\s*Search|ES)\b/gi,
        category: 'Database',
        subType: 'search',
        confidence: 0.90
      },
      OPENSEARCH: {
        name: 'OpenSearch',
        pattern: /\b(OpenSearch)\b/gi,
        category: 'Database',
        subType: 'search',
        confidence: 0.90
      }
    }
  },

  // === MESSAGE QUEUES ===
  QUEUES: {
    BULLMQ: {
      name: 'BullMQ',
      pattern: /\b(BullMQ|Bull\s*MQ)\b/gi,
      category: 'Queue',
      confidence: 0.95
    },
    RABBITMQ: {
      name: 'RabbitMQ',
      pattern: /\b(RabbitMQ|Rabbit\s*MQ)\b/gi,
      category: 'Queue',
      confidence: 0.95
    },
    KAFKA: {
      name: 'Kafka',
      pattern: /\b(Kafka|Apache\s*Kafka)\b/gi,
      category: 'Queue',
      confidence: 0.95
    },
    NATS: {
      name: 'NATS',
      pattern: /\b(NATS)\b/g,
      category: 'Queue',
      confidence: 0.90
    },
    SQS: {
      name: 'SQS',
      pattern: /\b(SQS|Amazon\s*SQS|AWS\s*SQS)\b/gi,
      category: 'Queue',
      confidence: 0.90
    }
  },

  // === AI/ML SERVICES ===
  AI_SERVICES: {
    embeddings: {
      TEI: {
        name: 'TEI',
        pattern: /\b(TEI|Text\s*Embeddings?\s*Inference)\b/gi,
        category: 'AI',
        subType: 'embeddings',
        confidence: 0.90
      },
      OPENAI_EMBEDDINGS: {
        name: 'OpenAI Embeddings',
        pattern: /\b(OpenAI\s*Embeddings?|text-embedding-\w+)\b/gi,
        category: 'AI',
        subType: 'embeddings',
        confidence: 0.90
      }
    },
    llm: {
      OLLAMA: {
        name: 'Ollama',
        pattern: /\b(Ollama)\b/gi,
        category: 'AI',
        subType: 'llm',
        confidence: 0.95
      },
      OPENAI: {
        name: 'OpenAI',
        pattern: /\b(OpenAI|GPT-4|GPT-3\.5|ChatGPT)\b/gi,
        category: 'AI',
        subType: 'llm',
        confidence: 0.95
      },
      ANTHROPIC: {
        name: 'Anthropic',
        pattern: /\b(Anthropic|Claude)\b/gi,
        category: 'AI',
        subType: 'llm',
        confidence: 0.95
      },
      GEMINI: {
        name: 'Gemini',
        pattern: /\b(Gemini|Google\s*Gemini)\b/gi,
        category: 'AI',
        subType: 'llm',
        confidence: 0.95
      },
      LLAMA: {
        name: 'LLaMA',
        pattern: /\b(LLaMA|Llama\s*\d*|llama\d*)\b/gi,
        category: 'AI',
        subType: 'llm',
        confidence: 0.90
      }
    },
    rag: {
      LIGHTRAG: {
        name: 'LightRAG',
        pattern: /\b(LightRAG|Light\s*RAG)\b/gi,
        category: 'AI',
        subType: 'rag',
        confidence: 0.90
      },
      GRAPHRAG: {
        name: 'GraphRAG',
        pattern: /\b(GraphRAG|Graph\s*RAG)\b/gi,
        category: 'AI',
        subType: 'rag',
        confidence: 0.90
      },
      LANGCHAIN: {
        name: 'LangChain',
        pattern: /\b(LangChain|Lang\s*Chain)\b/gi,
        category: 'AI',
        subType: 'rag',
        confidence: 0.95
      },
      LLAMAINDEX: {
        name: 'LlamaIndex',
        pattern: /\b(LlamaIndex|Llama\s*Index)\b/gi,
        category: 'AI',
        subType: 'rag',
        confidence: 0.90
      }
    }
  },

  // === FRAMEWORKS ===
  FRAMEWORKS: {
    backend: {
      EXPRESS: {
        name: 'Express',
        pattern: /\b(Express(?:\.js)?|express(?:\.js)?)\b/g,
        category: 'Framework',
        subType: 'backend',
        confidence: 0.85
      },
      FASTIFY: {
        name: 'Fastify',
        pattern: /\b(Fastify)\b/gi,
        category: 'Framework',
        subType: 'backend',
        confidence: 0.90
      },
      NESTJS: {
        name: 'NestJS',
        pattern: /\b(NestJS|Nest\.js|@nestjs)\b/gi,
        category: 'Framework',
        subType: 'backend',
        confidence: 0.95
      }
    },
    frontend: {
      REACT: {
        name: 'React',
        pattern: /\b(React(?:\.js)?|ReactJS)\b/gi,
        category: 'Framework',
        subType: 'frontend',
        confidence: 0.90
      },
      VUE: {
        name: 'Vue',
        pattern: /\b(Vue(?:\.js)?|VueJS)\b/gi,
        category: 'Framework',
        subType: 'frontend',
        confidence: 0.90
      },
      ANGULAR: {
        name: 'Angular',
        pattern: /\b(Angular(?:JS)?)\b/gi,
        category: 'Framework',
        subType: 'frontend',
        confidence: 0.90
      },
      NEXTJS: {
        name: 'Next.js',
        pattern: /\b(Next\.js|NextJS|next\.js)\b/gi,
        category: 'Framework',
        subType: 'frontend',
        confidence: 0.95
      }
    }
  },

  // === PROTOCOLS & STANDARDS ===
  PROTOCOLS: {
    REST: {
      name: 'REST',
      pattern: /\b(REST(?:ful)?|REST\s*API)\b/gi,
      category: 'Protocol',
      confidence: 0.85
    },
    GRAPHQL: {
      name: 'GraphQL',
      pattern: /\b(GraphQL)\b/gi,
      category: 'Protocol',
      confidence: 0.95
    },
    GRPC: {
      name: 'gRPC',
      pattern: /\b(gRPC|grpc)\b/g,
      category: 'Protocol',
      confidence: 0.95
    },
    WEBSOCKET: {
      name: 'WebSocket',
      pattern: /\b(WebSocket|WS|wss?:\/\/)\b/gi,
      category: 'Protocol',
      confidence: 0.85
    },
    MCP: {
      name: 'MCP',
      pattern: /\b(MCP|Model\s*Context\s*Protocol)\b/gi,
      category: 'Protocol',
      confidence: 0.90
    },
    SSE: {
      name: 'SSE',
      pattern: /\b(SSE|Server[\s-]?Sent[\s-]?Events?)\b/gi,
      category: 'Protocol',
      confidence: 0.85
    }
  },

  // === PROJECT-SPECIFIC ===
  PROJECT: {
    PROJECT_ADVISOR: {
      name: 'ProjectAdvisor',
      pattern: /\b(ProjectAdvisor|Project\s*Advisor|UN\s*ProjectAdvisor)\b/gi,
      category: 'System',
      confidence: 0.98
    },
    KNOWLEDGE_GRAPH: {
      name: 'Knowledge Graph',
      pattern: /\b(Knowledge\s*Graph|KG)\b/gi,
      category: 'Concept',
      confidence: 0.85
    },
    POLYSTORE: {
      name: 'Polystore',
      pattern: /\b(Polystore|poly[\s-]?store)\b/gi,
      category: 'Concept',
      confidence: 0.90
    }
  }
};

/**
 * Entity Categories for Graph Ontology
 */
const ENTITY_CATEGORIES = {
  STRATEGIC: {
    layer: 'Strategic',
    zPosition: -200,
    types: ['Epic', 'Feature', 'BusinessRule', 'Concept', 'Strategy', 'Initiative', 'Goal', 'KPI'],
    color: '#9C27B0', // Purple
    shape: 'icosahedron'
  },
  BUSINESS: {
    layer: 'Business',
    zPosition: 0,
    types: ['WorkItem', 'Document', 'Person', 'Team', 'Organization', 'Process', 'Meeting'],
    color: '#00BCD4', // Cyan
    shape: 'sphere'
  },
  CODE: {
    layer: 'Code',
    zPosition: 200,
    types: ['File', 'Class', 'Function', 'Method', 'Interface', 'Module', 'Commit', 'Changeset'],
    color: '#E91E63', // Magenta
    shape: 'cube'
  }
};

/**
 * Relationship Types (47 types as per specification)
 */
const RELATIONSHIP_TYPES = {
  // Structural (10)
  CONTAINS: { category: 'Structural', description: 'Parent contains child' },
  PART_OF: { category: 'Structural', description: 'Child is part of parent' },
  INHERITS: { category: 'Structural', description: 'Class inheritance' },
  IMPLEMENTS: { category: 'Structural', description: 'Interface implementation' },
  EXTENDS: { category: 'Structural', description: 'Class extension' },
  NESTED_IN: { category: 'Structural', description: 'Nested within' },
  BELONGS_TO: { category: 'Structural', description: 'Membership relation' },
  GROUPS: { category: 'Structural', description: 'Grouping relation' },
  COMPOSED_OF: { category: 'Structural', description: 'Composition relation' },
  AGGREGATES: { category: 'Structural', description: 'Aggregation relation' },

  // Dependencies (10)
  CALLS: { category: 'Dependencies', description: 'Function/method call' },
  USES: { category: 'Dependencies', description: 'General usage' },
  IMPORTS: { category: 'Dependencies', description: 'Module import' },
  EXPORTS: { category: 'Dependencies', description: 'Module export' },
  DEPENDS_ON: { category: 'Dependencies', description: 'General dependency' },
  REQUIRES: { category: 'Dependencies', description: 'Requirement dependency' },
  PROVIDES: { category: 'Dependencies', description: 'Provides functionality' },
  CONSUMES: { category: 'Dependencies', description: 'Consumes resource/API' },
  READS: { category: 'Dependencies', description: 'Reads from source' },
  WRITES: { category: 'Dependencies', description: 'Writes to target' },

  // Semantic (10)
  MENTIONS: { category: 'Semantic', description: 'Text mention' },
  RELATED_TO: { category: 'Semantic', description: 'General relation' },
  SIMILAR_TO: { category: 'Semantic', description: 'Semantic similarity' },
  DESCRIBES: { category: 'Semantic', description: 'Documentation' },
  REFERENCES: { category: 'Semantic', description: 'Reference to' },
  DOCUMENTS: { category: 'Semantic', description: 'Documentation relation' },
  DEFINES: { category: 'Semantic', description: 'Definition relation' },
  EXPLAINS: { category: 'Semantic', description: 'Explanation relation' },
  CONTRADICTS: { category: 'Semantic', description: 'Contradictory information' },
  CONFIRMS: { category: 'Semantic', description: 'Confirmation relation' },

  // Tracking (10)
  IMPLEMENTS_REQUIREMENT: { category: 'Tracking', description: 'Implements a requirement' },
  RESOLVES_ISSUE: { category: 'Tracking', description: 'Resolves issue/bug' },
  MODIFIES: { category: 'Tracking', description: 'Modifies entity' },
  CREATES: { category: 'Tracking', description: 'Creates entity' },
  DELETES: { category: 'Tracking', description: 'Deletes entity' },
  BLOCKS: { category: 'Tracking', description: 'Blocking dependency' },
  BLOCKED_BY: { category: 'Tracking', description: 'Blocked by dependency' },
  DUPLICATES: { category: 'Tracking', description: 'Duplicate of' },
  PARENT_OF: { category: 'Tracking', description: 'Parent work item' },
  CHILD_OF: { category: 'Tracking', description: 'Child work item' },

  // Communication (7)
  AUTHORED_BY: { category: 'Communication', description: 'Authored by person' },
  ASSIGNED_TO: { category: 'Communication', description: 'Assigned to person' },
  REVIEWED_BY: { category: 'Communication', description: 'Reviewed by person' },
  APPROVED_BY: { category: 'Communication', description: 'Approved by person' },
  MEMBER_OF: { category: 'Communication', description: 'Team membership' },
  REPORTS_TO: { category: 'Communication', description: 'Reporting structure' },
  COLLABORATES_WITH: { category: 'Communication', description: 'Collaboration relation' },

  // UN Document Relations — typed links between UN documents (Document↔Document).
  // Some ride on a shared edge label with the semantic in the `relType` property
  // (e.g. SUPERSEDES {relType:'AMENDS'}); listed here so the ontology validator
  // recognizes them.
  CITES: { category: 'UN Document', description: 'Document cites/references another document' },
  SUPERSEDES: { category: 'UN Document', description: 'Document supersedes an earlier one' },
  AMENDS: { category: 'UN Document', description: 'Document amends another' },
  REVOKES: { category: 'UN Document', description: 'Document revokes another' },
  RENEWS: { category: 'UN Document', description: 'Document renews/extends a mandate' },
  SUPPLEMENTS: { category: 'UN Document', description: 'Document supplements another' },
  CORRECTS: { category: 'UN Document', description: 'Corrigendum corrects its base document' },
  REVISES: { category: 'UN Document', description: 'Revision revises its base document' },
  HAS_ADDENDUM: { category: 'UN Document', description: 'Base document has an addendum' },
  DRAFT_OF: { category: 'UN Document', description: 'Draft of a final document' },
  PART_OF_SERIES: { category: 'UN Document', description: 'Document is part of a document series' },
  CONSIDERED_UNDER: { category: 'UN Document', description: 'Document considered under an agenda item' },
  TRANSMITS: { category: 'UN Document', description: 'Cover note transmits another document' },
  RESPONDS_TO: { category: 'UN Document', description: 'Document responds to another' }
};

/**
 * Recursively extract patterns from nested config object
 * @param {Object} config - Config object (potentially nested)
 * @param {string} text - Text to search
 * @param {Array} results - Array to push results to
 * @param {string} parentCategory - Parent category name
 */
function extractFromNestedConfig(config, text, results, parentCategory = '') {
  for (const [key, value] of Object.entries(config)) {
    // If value has a pattern property, it's a leaf node
    if (value.pattern) {
      const matches = text.matchAll(value.pattern);
      for (const match of matches) {
        results.push({
          type: key,
          name: value.name,
          match: match[0],
          index: match.index,
          category: value.category || parentCategory,
          subType: value.subType,
          confidence: value.confidence || 0.85
        });
      }
    } else if (typeof value === 'object') {
      // Recurse into nested object
      extractFromNestedConfig(value, text, results, key);
    }
  }
}

/**
 * Extract extended technology entities from text
 * @param {string} text - Input text
 * @returns {Object} Extracted technology entities grouped by category
 */
function extractExtendedTechnologyEntities(text) {
  const results = {
    databases: [],
    queues: [],
    aiServices: [],
    frameworks: [],
    protocols: [],
    project: []
  };

  // Extract databases
  extractFromNestedConfig(EXTENDED_TECHNOLOGY_PATTERNS.DATABASES, text, results.databases, 'Database');

  // Extract queues
  extractFromNestedConfig(EXTENDED_TECHNOLOGY_PATTERNS.QUEUES, text, results.queues, 'Queue');

  // Extract AI services
  extractFromNestedConfig(EXTENDED_TECHNOLOGY_PATTERNS.AI_SERVICES, text, results.aiServices, 'AI');

  // Extract frameworks
  extractFromNestedConfig(EXTENDED_TECHNOLOGY_PATTERNS.FRAMEWORKS, text, results.frameworks, 'Framework');

  // Extract protocols
  extractFromNestedConfig(EXTENDED_TECHNOLOGY_PATTERNS.PROTOCOLS, text, results.protocols, 'Protocol');

  // Extract project-specific
  extractFromNestedConfig(EXTENDED_TECHNOLOGY_PATTERNS.PROJECT, text, results.project, 'Project');

  return results;
}

/**
 * Combine all patterns for quick extraction
 * @param {string} text - Input text to analyze
 * @returns {Object} Extracted entities grouped by category
 */
function extractAllEntities(text) {
  const results = {
    systems: [],
    documents: [],
    organizations: [],
    workItems: [],
    persons: [],
    technical: [],
    // New categories for extended technology patterns
    technologies: []
  };

  // Extract UN Systems
  for (const [key, config] of Object.entries(UN_SYSTEMS)) {
    const matches = text.matchAll(config.pattern);
    for (const match of matches) {
      results.systems.push({
        type: key,
        name: config.name,
        match: match[0],
        index: match.index,
        category: config.category
      });
    }
  }

  // Extract Document References
  for (const [key, config] of Object.entries(UN_DOCUMENT_PATTERNS)) {
    const matches = text.matchAll(config.pattern);
    for (const match of matches) {
      results.documents.push({
        type: key,
        name: config.name,
        match: match[0],
        index: match.index,
        category: config.category
      });
    }
  }

  // Extract Organizations
  for (const [key, config] of Object.entries(UN_ORGANIZATIONS)) {
    const matches = text.matchAll(config.pattern);
    for (const match of matches) {
      results.organizations.push({
        type: key,
        name: config.name,
        fullName: config.fullName,
        match: match[0],
        index: match.index,
        category: config.category
      });
    }
  }

  // Extract Work Item References
  for (const [key, config] of Object.entries(WORK_ITEM_PATTERNS)) {
    const matches = text.matchAll(config.pattern);
    for (const match of matches) {
      results.workItems.push({
        type: key,
        match: match[0],
        id: match[1] || match[2],
        index: match.index
      });
    }
  }

  // Extract Person References
  for (const [key, config] of Object.entries(PERSON_PATTERNS)) {
    const matches = text.matchAll(config.pattern);
    for (const match of matches) {
      results.persons.push({
        type: key,
        match: match[0],
        index: match.index,
        category: config.category
      });
    }
  }

  // Extract Technical References
  for (const [key, config] of Object.entries(TECHNICAL_PATTERNS)) {
    const matches = text.matchAll(config.pattern);
    for (const match of matches) {
      results.technical.push({
        type: key,
        match: match[0],
        index: match.index,
        category: config.category
      });
    }
  }

  // Extract Extended Technology Patterns (Memgraph, Qdrant, Redis, etc.)
  const techEntities = extractExtendedTechnologyEntities(text);

  // Flatten all tech entities into technologies array
  for (const category of Object.values(techEntities)) {
    results.technologies.push(...category);
  }

  return results;
}

/**
 * Get layer for entity type
 * @param {string} entityType - Entity type name
 * @returns {Object|null} Layer configuration
 */
function getLayerForType(entityType) {
  for (const [, config] of Object.entries(ENTITY_CATEGORIES)) {
    if (config.types.includes(entityType)) {
      return config;
    }
  }
  return null;
}

/**
 * Get relationship metadata
 * @param {string} relType - Relationship type
 * @returns {Object|null} Relationship configuration
 */
function getRelationshipMeta(relType) {
  return RELATIONSHIP_TYPES[relType] || null;
}

module.exports = {
  UN_SYSTEMS,
  UN_DOCUMENT_PATTERNS,
  UN_ORGANIZATIONS,
  WORK_ITEM_PATTERNS,
  PERSON_PATTERNS,
  TECHNICAL_PATTERNS,
  EXTENDED_TECHNOLOGY_PATTERNS,
  ENTITY_CATEGORIES,
  RELATIONSHIP_TYPES,
  extractAllEntities,
  extractExtendedTechnologyEntities,
  getLayerForType,
  getRelationshipMeta
};

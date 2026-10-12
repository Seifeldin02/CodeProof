/**
 * One list of skill names for reading CVs and job briefs, so the same words are read the same way on both sides.
 * A name is the spelling shown to recruiters and saved with a CV, so the names already saved keep their spelling.
 */

/** Decides from the words around a hit whether it is the skill and not an everyday word or a person's name. */
type Guard = (before: string, after: string) => boolean;

interface SkillDefinition {
  readonly name: string;
  /** The name is also an everyday word, so it counts in its exact letter case only. */
  readonly everydayWord?: boolean;
  /** Other spellings, read in any letter case. A space also matches a hyphen or nothing at all. */
  readonly aliases?: readonly string[];
  /** Other spellings that count in this exact letter case only. */
  readonly exact?: readonly string[];
  /** Regular expressions for spellings a plain alias cannot describe, read in any letter case. */
  readonly patterns?: readonly string[];
  /** Applied to the name and to the exact-case spellings. Aliases and patterns are unambiguous already. */
  readonly accept?: Guard;
  /** Skills nobody can use this one without. */
  readonly implies?: readonly string[];
}

/** A one-letter or name-like skill counts inside a list of skills, or right before a word about its use. */
function inSkillList(nouns: RegExp): Guard {
  return (before, after) => nouns.test(after)
    || (/(?:^|[,;:/|(•·▪◦*–—-]|\b(?:and|or|in|with|using|via|through|on|of|for|like|including|to)\s)\s*$/i.test(before)
      && /^\s*(?:$|[,;:/|).]|(?:and|or|for|to|in|on|with)\s)/i.test(after));
}

/** "Go to market" and "Go-live" are not the language. */
const notTheVerbGo: Guard = (_before, after) => !/^(?:[-–—]|\s+(?:to|live|ahead|for|on|into|through|beyond|above|back|out|up|down|over|the|a|an)\b)/.test(after);

/** "Spring 2021" and "Spring semester" are a season. */
const notTheSeason: Guard = (_before, after) => !/^\s*(?:'?\d{2,4}\b|of\s+\d{4}|[/&-]\s*(?:summer|fall|autumn|winter)|semester|term\b|quarter|break|intake|cohort|session|season|collection)/i.test(after);

const SKILLS: readonly SkillDefinition[] = [
  // Languages
  { name: "JavaScript", aliases: ["Java Script", "ECMAScript", "ES6", "ES2015"], exact: ["JS"] },
  { name: "TypeScript", exact: ["TS"], accept: (_before, after) => !/^\s*\/\s*SCI/i.test(after), implies: ["JavaScript"] },
  { name: "Python", patterns: ["python\\s*[23](?:\\.\\d+)?"] },
  { name: "Java", patterns: ["java\\s*(?:8|11|17|21|se|ee)"], aliases: ["J2EE"] },
  { name: "Kotlin" },
  { name: "Go", everydayWord: true, aliases: ["Golang"], accept: notTheVerbGo },
  { name: "Rust", everydayWord: true },
  { name: "C#", aliases: ["C Sharp"] },
  { name: ".NET", patterns: ["\\.net\\s*(?:core|framework)", "\\.net\\s*\\d(?:\\.\\d)?"], aliases: ["ASP.NET", "ASP.NET Core", "ASP.NET MVC", "VB.NET", "dot net"] },
  { name: "C++", patterns: ["c\\+\\+\\s*(?:11|14|17|20|23)"], aliases: ["CPP"] },
  { name: "C", everydayWord: true, patterns: ["(?:embedded|ansi)\\s+c(?![+#])"], accept: inSkillList(/^\s+(?:programming|language|developer|compiler)\b/i) },
  { name: "Objective-C", aliases: ["ObjC"] },
  { name: "Swift", everydayWord: true, aliases: ["SwiftUI"], accept: (_before, after) => !/^\s*(?:code|transfer|payment|message)/i.test(after) },
  { name: "Dart", everydayWord: true },
  { name: "PHP" },
  { name: "Ruby", everydayWord: true, accept: inSkillList(/^\s+(?:on\s+rails|developer|engineer|programming|gems?|scripts?)\b/i) },
  { name: "Scala" },
  { name: "R", everydayWord: true, aliases: ["R Studio"], accept: inSkillList(/^\s+(?:programming|language|shiny|scripts?|packages?)\b/i) },
  { name: "MATLAB" },
  { name: "Perl" },
  { name: "Bash", aliases: ["shell scripting", "shell scripts", "shell script"] },
  { name: "PowerShell" },
  { name: "SQL", patterns: ["pl[\\s/-]*sql", "t[\\s-]*sql"] },
  { name: "HTML", patterns: ["html\\s*5"] },
  { name: "CSS", patterns: ["css\\s*3"] },
  { name: "Sass", aliases: ["SCSS"], implies: ["CSS"] },
  { name: "Solidity" },
  { name: "VBA" },
  { name: "ABAP" },

  // Web interfaces
  { name: "React", patterns: ["react[\\s.-]*js"], accept: (_before, after) => !/^\s+(?:to|quickly|promptly|fast|accordingly|appropriately)\b/i.test(after), implies: ["JavaScript"] },
  { name: "Next.js", patterns: ["next[\\s-]*js"], implies: ["React"] },
  { name: "Vue", patterns: ["vue[\\s.-]*js", "vue\\s*[23]"], implies: ["JavaScript"] },
  { name: "Nuxt", patterns: ["nuxt[\\s.-]*js", "nuxt\\s*[23]"], implies: ["Vue"] },
  { name: "Angular", patterns: ["angular[\\s.-]*js", "angular\\s*\\d{1,2}\\+?"], implies: ["JavaScript"] },
  { name: "Svelte", aliases: ["SvelteKit"], implies: ["JavaScript"] },
  { name: "Redux", aliases: ["Redux Toolkit"] },
  { name: "RxJS", aliases: ["NgRx"] },
  { name: "Zustand" },
  { name: "Tailwind CSS", aliases: ["Tailwind"], implies: ["CSS"] },
  { name: "Bootstrap", everydayWord: true, implies: ["CSS"] },
  { name: "jQuery" },
  { name: "Webpack" },
  { name: "Vite", everydayWord: true },
  { name: "Storybook" },
  { name: "Material UI", exact: ["MUI"] },
  { name: "Electron", everydayWord: true },
  { name: "Figma" },
  { name: "UI/UX", aliases: ["UX/UI", "UX design", "UI design", "user experience"] },
  { name: "Accessibility", aliases: ["a11y", "WCAG"] },

  // Servers and APIs
  { name: "Node.js", patterns: ["node[\\s-]*js"], exact: ["Node"], implies: ["JavaScript"] },
  { name: "Express", everydayWord: true, patterns: ["express[\\s.-]*js"], accept: (before, after) => !/american\s+$/i.test(before) && !/^\s+(?:entry|delivery|shipping|mail|courier)\b/i.test(after), implies: ["Node.js"] },
  { name: "Fastify", implies: ["Node.js"] },
  { name: "NestJS", patterns: ["nest[\\s.-]+js"], implies: ["Node.js"] },
  { name: "Sequelize", implies: ["Node.js"] },
  { name: "TypeORM", implies: ["Node.js", "TypeScript"] },
  { name: "Django", implies: ["Python"] },
  { name: "Django REST Framework", exact: ["DRF"], implies: ["Django", "REST"] },
  { name: "FastAPI", aliases: ["Fast API"], implies: ["Python"] },
  { name: "Flask", implies: ["Python"] },
  { name: "Laravel", implies: ["PHP"] },
  { name: "Symfony", implies: ["PHP"] },
  { name: "CodeIgniter", implies: ["PHP"] },
  { name: "Spring", everydayWord: true, aliases: ["Spring Boot", "Spring MVC", "Spring Framework", "Spring Security", "Spring Cloud", "Spring Data"], accept: notTheSeason },
  { name: "Hibernate", everydayWord: true },
  { name: "Maven", everydayWord: true },
  { name: "Gradle" },
  { name: "Ruby on Rails", exact: ["Rails", "RoR"], implies: ["Ruby"] },
  { name: "Entity Framework", aliases: ["EF Core"], implies: [".NET"] },
  { name: "Blazor", implies: [".NET"] },
  { name: "GraphQL" },
  { name: "REST", everydayWord: true, aliases: ["RESTful", "REST API", "REST APIs", "RESTful API", "RESTful APIs", "REST services"] },
  { name: "OpenAPI", aliases: ["Swagger"] },
  { name: "gRPC" },
  { name: "WebSockets", aliases: ["WebSocket", "Socket.IO"] },
  { name: "Microservices", aliases: ["micro services", "micro service"] },
  { name: "OAuth", patterns: ["oauth\\s*2(?:\\.0)?"], aliases: ["OpenID Connect"], exact: ["OIDC"] },
  { name: "JWT" },
  { name: "Celery", implies: ["Python"] },
  { name: "RabbitMQ" },
  { name: "Kafka" },
  { name: "WordPress" },
  { name: "Odoo" },
  { name: "SAP", everydayWord: true },
  { name: "Salesforce" },
  { name: "SharePoint" },
  { name: "Power Apps" },
  { name: "Power Automate" },
  { name: "Dynamics 365", aliases: ["Dynamics CRM"], exact: ["D365"] },
  { name: "ServiceNow" },
  { name: "OutSystems" },

  // Mobile
  { name: "React Native", implies: ["React"] },
  { name: "Flutter", implies: ["Dart"] },
  { name: "Android" },
  { name: "iOS", everydayWord: true, exact: ["IOS"] },
  { name: "Jetpack Compose", implies: ["Kotlin", "Android"] },
  { name: "Xamarin", implies: [".NET"] },
  { name: "Ionic", everydayWord: true },

  // Data stores
  { name: "PostgreSQL", aliases: ["Postgres", "Postgre SQL"], implies: ["SQL"] },
  { name: "MySQL", implies: ["SQL"] },
  { name: "MariaDB", implies: ["SQL"] },
  { name: "SQL Server", aliases: ["MS SQL"], implies: ["SQL"] },
  { name: "Oracle", everydayWord: true, accept: (before, after) => !/(?:\bat|@|\bjoined|\bfrom)\s+$/i.test(before) && !/^\s+(?:corporation|corp\b|inc\b|ltd\b|company)/i.test(after), implies: ["SQL"] },
  { name: "SQLite", implies: ["SQL"] },
  { name: "MongoDB", aliases: ["Mongoose"], exact: ["Mongo"] },
  { name: "Redis" },
  { name: "Elasticsearch", aliases: ["Elastic Search", "OpenSearch"], exact: ["ELK"] },
  { name: "DynamoDB" },
  { name: "Cassandra", accept: inSkillList(/^\s+(?:database|db|clusters?)\b/i) },
  { name: "Firebase", aliases: ["Firestore"] },
  { name: "Supabase" },
  { name: "Prisma" },
  { name: "SQLAlchemy", implies: ["Python"] },
  { name: "NoSQL" },

  // Data and machine learning
  { name: "Pandas", implies: ["Python"] },
  { name: "NumPy", implies: ["Python"] },
  { name: "scikit-learn", aliases: ["sklearn"], implies: ["Python", "Machine Learning"] },
  { name: "TensorFlow", implies: ["Machine Learning"] },
  { name: "PyTorch", implies: ["Machine Learning"] },
  { name: "Keras", implies: ["Machine Learning"] },
  { name: "Machine Learning", exact: ["ML"] },
  { name: "Deep Learning", implies: ["Machine Learning"] },
  { name: "MLOps", implies: ["Machine Learning"] },
  { name: "NLP", everydayWord: true, aliases: ["Natural Language Processing"] },
  { name: "Computer Vision", aliases: ["OpenCV"] },
  { name: "Generative AI", aliases: ["Gen AI", "Large Language Models", "Large Language Model", "LangChain", "OpenAI", "prompt engineering"], exact: ["LLM", "LLMs"] },
  { name: "Data Analysis", aliases: ["Data Analytics"] },
  { name: "Data Science" },
  { name: "Data visualization", aliases: ["data visualisation"] },
  { name: "Statistics", aliases: ["statistical analysis"] },
  { name: "A/B testing" },
  { name: "Power BI" },
  { name: "Tableau" },
  { name: "Excel", everydayWord: true, accept: (_before, after) => !/^\s+at\b/i.test(after) },
  { name: "Looker", everydayWord: true },
  { name: "Google Analytics" },
  { name: "SPSS" },
  { name: "SAS", everydayWord: true },
  { name: "Spark", everydayWord: true, aliases: ["PySpark"] },
  { name: "Hadoop" },
  { name: "Airflow" },
  { name: "dbt", everydayWord: true },
  { name: "Snowflake", everydayWord: true, implies: ["SQL"] },
  { name: "BigQuery", implies: ["SQL"] },
  { name: "Redshift", implies: ["SQL"] },
  { name: "Databricks" },
  { name: "ETL", everydayWord: true, exact: ["ELT"], aliases: ["data pipelines", "data pipeline"] },
  { name: "Data Warehousing", aliases: ["data warehouse", "data warehouses"] },

  // Cloud and delivery
  { name: "AWS", aliases: ["Amazon Web Services"], exact: ["EC2", "S3"] },
  { name: "CloudFormation", implies: ["AWS"] },
  { name: "Azure" },
  { name: "Azure DevOps" },
  { name: "Google Cloud", exact: ["GCP"] },
  { name: "Docker", aliases: ["Dockerfile"] },
  { name: "Kubernetes", aliases: ["K8s"], exact: ["EKS", "AKS", "GKE"] },
  { name: "Helm", everydayWord: true, implies: ["Kubernetes"] },
  { name: "Argo CD" },
  { name: "Terraform" },
  { name: "Ansible" },
  { name: "Jenkins", accept: inSkillList(/^\s+(?:pipelines?|jobs?|ci|server|builds?)\b/i), implies: ["CI/CD"] },
  { name: "GitHub Actions", implies: ["CI/CD"] },
  { name: "GitLab CI", patterns: ["gitlab[\\s-]*ci\\s*/\\s*cd"], implies: ["CI/CD"] },
  { name: "CircleCI", implies: ["CI/CD"] },
  { name: "CI/CD", aliases: ["CI CD", "continuous integration", "continuous delivery", "continuous deployment"] },
  { name: "DevOps" },
  { name: "Linux", aliases: ["Unix", "Ubuntu", "CentOS", "Debian"], exact: ["RHEL"] },
  { name: "Nginx" },
  { name: "Git", aliases: ["GitHub", "GitLab", "Bitbucket", "version control"] },
  { name: "Prometheus" },
  { name: "Grafana" },
  { name: "Datadog" },
  { name: "Splunk" },
  { name: "Serverless" },
  { name: "Infrastructure as Code", exact: ["IaC"] },

  // Testing
  { name: "Testing", aliases: ["unit tests", "integration tests", "automated tests", "test automation", "test-driven development", "end-to-end tests", "e2e tests"], exact: ["TDD"] },
  { name: "Jest", implies: ["Testing"] },
  { name: "Vitest", implies: ["Testing"] },
  { name: "Cypress", implies: ["Testing"] },
  { name: "Playwright", implies: ["Testing"] },
  { name: "Selenium", implies: ["Testing"] },
  { name: "Appium", implies: ["Testing"] },
  { name: "JUnit", implies: ["Testing"] },
  { name: "TestNG", implies: ["Testing"] },
  { name: "xUnit", aliases: ["NUnit"], implies: ["Testing"] },
  { name: "pytest", aliases: ["py.test"], implies: ["Python", "Testing"] },
  { name: "Mocha", implies: ["Testing"] },
  { name: "Testing Library", implies: ["Testing"] },
  { name: "Postman", everydayWord: true },

  // Ways of working
  { name: "Agile", aliases: ["Scrum", "Kanban"] },
  { name: "Jira" },
  { name: "Security", aliases: ["OWASP", "cyber security", "secure coding", "penetration testing", "pen testing"] },
  { name: "System design", aliases: ["systems design", "software architecture", "distributed systems"] },
  { name: "Data structures and algorithms", aliases: ["data structures", "algorithms"], exact: ["DSA"] },
  { name: "Object-oriented programming", aliases: ["object oriented"], exact: ["OOP", "OOD"] },
  { name: "Design patterns" },

  // Other fields
  { name: "Unity", everydayWord: true, aliases: ["Unity 3D"] },
  { name: "Unreal Engine", exact: ["UE4", "UE5"] },
  { name: "Blockchain", aliases: ["Web3", "smart contracts"] },
  { name: "Embedded systems", aliases: ["embedded software", "firmware", "microcontrollers", "Arduino", "STM32"], exact: ["RTOS"] },
];

interface Matcher { readonly name: string; readonly regex: RegExp; readonly guard?: Guard }

function spelling(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s*\/\s*/g, "\\s*/\\s*").replace(/[\s-]+/g, "[\\s-]*");
}

/** A full stop right before a hit means the hit is the tail of something else, such as the "js" of "Node.js". */
function matcher(name: string, source: string, anyCase: boolean, guard?: Guard): Matcher {
  return { name, regex: new RegExp(`(^|[^A-Za-z0-9.])(${source})(?![A-Za-z0-9])`, anyCase ? "gi" : "g"), guard };
}

const MATCHERS: readonly Matcher[] = SKILLS.flatMap((skill) => [
  matcher(skill.name, spelling(skill.name), !skill.everydayWord, skill.accept),
  ...(skill.aliases ?? []).map((alias) => matcher(skill.name, spelling(alias), true)),
  ...(skill.patterns ?? []).map((pattern) => matcher(skill.name, pattern, true)),
  ...(skill.exact ?? []).map((exact) => matcher(skill.name, spelling(exact), false, skill.accept)),
]);

const CANONICAL = new Map(SKILLS.map((skill) => [skill.name.toLowerCase(), skill.name]));

/** Every skill a name stands for: itself, and whatever it cannot be used without. */
const COVERS = new Map(SKILLS.map((skill) => {
  const covered = new Set([skill.name]);
  const pending = [...(skill.implies ?? [])];
  while (pending.length > 0) {
    const next = pending.pop();
    if (!next || covered.has(next)) continue;
    covered.add(next);
    pending.push(...(SKILLS.find((item) => item.name === next)?.implies ?? []));
  }
  return [skill.name, [...covered]] as const;
}));

/** A link or an e-mail address names a place, not a skill: "github.com/someone/django-shop" is not a Django claim. */
const LINKS = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|\b(?:[a-z0-9-]+\.)*(?:github|gitlab|bitbucket|linkedin|medium|twitter|x|behance|dribbble|stackoverflow|kaggle|youtube|facebook|instagram)\.(?:com|org|net|io)\S*|\b[a-z0-9-]+\.(?:vercel\.app|netlify\.app|github\.io|herokuapp\.com|pages\.dev)\S*/gi;

interface Hit { name: string; start: number; end: number }

function hitsIn(line: string): Hit[] {
  const text = line.replace(LINKS, (link) => " ".repeat(link.length));
  const hits: Hit[] = [];
  for (const { name, regex, guard } of MATCHERS) {
    regex.lastIndex = 0;
    for (let found = regex.exec(text); found; found = regex.exec(text)) {
      const start = found.index + found[1].length;
      const end = start + found[2].length;
      if (!guard || guard(text.slice(0, start), text.slice(end))) hits.push({ name, start, end });
      regex.lastIndex = end;
    }
  }
  // The longest reading wins: "React Native" is not also a mention of React, nor "Spring Security" of Security.
  const kept: Hit[] = [];
  for (const hit of hits.sort((left, right) => (right.end - right.start) - (left.end - left.start) || left.start - right.start)) {
    if (!kept.some((other) => other.start <= hit.start && hit.end <= other.end)) kept.push(hit);
  }
  return kept.sort((left, right) => left.start - right.start);
}

/** The skills a text names, each once, in the order the text names them. */
export function skillsIn(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) for (const hit of hitsIn(line)) names.add(hit.name);
  return [...names];
}

/** The listed spelling of a skill name, or null when the value is not one. */
export function canonicalSkill(value: string): string | null {
  return CANONICAL.get(value.trim().toLowerCase()) ?? null;
}

/**
 * What a set of named skills covers. Each covered skill maps to the names that cover it, so a reader can be told
 * that "Python" is covered because the CV names Django.
 */
export function skillsCoveredBy(names: Iterable<string>): Map<string, string[]> {
  const covered = new Map<string, string[]>();
  for (const name of names) {
    for (const skill of COVERS.get(name) ?? []) covered.set(skill, [...(covered.get(skill) ?? []), name]);
  }
  // A skill the text names itself needs no explanation through another one.
  for (const [skill, sources] of covered) if (sources.includes(skill)) covered.set(skill, [skill]);
  return covered;
}

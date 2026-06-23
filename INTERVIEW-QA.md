# AI Agent Lab 高频面试题 + 代码定位

> 本文件是「AI Agent Lab」项目的高频面试题速查手册。
> 每道题包含:**问题 → 标准回答思路 → 代码定位(文件:行号) → 常见错误答案/陷阱**。
> 面试前过一遍,确保每个问题都能指着自己的代码讲。

---

## 目录

1. [RAG 检索增强生成](#1-rag-检索增强生成)
2. [Agent 与 Tool Calling](#2-agent-与-tool-calling)
3. [Memory 记忆系统](#3-memory-记忆系统)
4. [MCP 协议](#4-mcp-协议)
5. [Multi-Agent 工作流](#5-multi-agent-工作流)
6. [Structured Output 结构化输出](#6-structured-output-结构化输出)
7. [认证与数据隔离](#7-认证与数据隔离)
8. [TanStack Query 前端数据层](#8-tanstack-query-前端数据层)
9. [Next.js 与工程化](#9-nextjs-与工程化)

---

## 1. RAG 检索增强生成

### Q1.1 文档怎么切分的?为什么选 500 字符?

**代码定位**: `src/lib/rag.ts:23,29`

**回答思路**:
- 按段落优先切分,段落超过 500 字符再按句子拆(`。.!!??;` 等分隔符)
- 保证语义完整,不会把列表、短句切得太碎
- 1024 维 embedding 容纳的语义量大约在这个范围,太小丢上下文,太大稀释相关性

**陷阱**: 不要回答"随便选的"或"按句号切"。要讲清楚是「段落优先 + 超长兜底」的策略。

---

### Q1.2 embedding 维度为什么是 1024?

**代码定位**: `src/db/schema.ts:37`

**回答思路**:
- 维度必须和 embedding 模型一致,写死在 schema 里
- 阿里云百炼 text-embedding-v4 输出 1024 维
- 换模型要重建向量列,这是硬约束

**陷阱**: 不要说"越大越好"。维度越高语义表达能力越强,但存储和检索成本也越高。

---

### Q1.3 检索 Top-K 为什么是 4?阈值怎么定?

**代码定位**: `src/lib/vector-store.ts:102-124`(`search` 函数,`topK=4` 默认参数)

**回答思路**:
- Top-K 是召回数量,4 是平衡召回率和上下文长度的经验值
- 相似度用余弦距离(`cosineDistance`),转换成相似度 `1 - distance`
- 有 `minSimilarity` 阈值过滤,低于阈值的结果丢弃

**陷阱**: 不要说"越大越好"。K 太大把不相关的也塞进去,反而干扰模型。

---

### Q1.4 HNSW 索引是什么?为什么用它?

**代码定位**: `src/db/schema.ts:46`(`using("hnsw", ...).op("vector_cosine_ops")`)

**回答思路**:
- HNSW(Hierarchical Navigable Small World)是近似最近邻(ANN)索引
- 把暴力扫描的 O(n) 降到近似对数级
- `m: 16, efConstruction: 64` 是 pgvector 默认值,适合中小规模数据
- 百万级以上可能要调大 `efSearch`

**陷阱**: 不要混淆"精确检索"和"近似检索"。HNSW 是近似,牺牲一点精度换巨大速度提升。

---

### Q1.5 怎么提升检索质量?

**代码定位**: 无(这是后续优化方向,可以指 `src/lib/vector-store.ts` 说"现在只有单路召回")

**回答思路**(三个方向):
1. **Rerank 重排**:用交叉编码器(如 BGE-reranker)对 Top-K 重新打分
2. **混合检索**:向量检索 + 关键词检索(BM25)结果融合
3. **Query 改写**:把口语化问题转成检索友好的关键词

**陷阱**: 这是面试官最爱追问的方向。能讲出方向 + 为什么还没做(当前规模不需要)就够了。

---

### Q1.6 知识库没有相关内容时怎么办?

**代码定位**: `src/lib/tools/index.ts:94-110`(searchKnowledgeBase 的 execute)

**回答思路**:
- 检索结果为空时,工具返回 `found: false`
- Agent 拿到后会如实告诉用户"知识库中暂无相关内容"
- **绝不编造**——这是 RAG 区别于普通聊天的核心

---

## 2. Agent 与 Tool Calling

### Q2.1 Agent 怎么决定调哪个工具?

**代码定位**: `src/lib/tools/index.ts:18,37,56,85,118`(各工具的 `description`)

**回答思路**:
- 靠 `description` 做语义匹配。模型看到用户问题,和每个工具的描述做比对
- 我写的 description 会明确"什么场景调用"和"什么场景不调用"
- 模型只看 description 和 inputSchema,execute 是服务端私有逻辑

**陷阱**: 不要说"用 if/else 判断关键词"。Agent 是模型自主决策,不是规则引擎。

---

### Q2.2 多步调用怎么防止死循环?

**代码定位**: `src/app/api/chat/route.ts:96`(`stopWhen: stepCountIs(5)`)

**回答思路**:
- `stepCountIs(5)` 限制最多 5 步工具调用循环
- 模型可以"调工具 → 看结果 → 继续推理 → 再调工具"
- 没有这个配置,模型只会调一次工具就停(单步)

**陷阱**: 不要混"单步"和"多步"。多步是 Agent 的核心能力,但必须有上限。

---

### Q2.3 工具的 inputSchema 用什么?为什么?

**代码定位**: `src/lib/tools/index.ts:19-22`(zod schema)

**回答思路**:
- 用 Zod 定义输入 schema
- AI SDK 把 Zod 转成 JSON Schema 发给模型,模型按 schema 生成参数
- 服务端再用同一个 Zod 校验,双重保险

---

### Q2.4 工具执行失败怎么办?

**代码定位**: `src/lib/tools/index.ts:41-53`(calculate 的错误处理)

**回答思路**:
- execute 里 try/catch,返回带 `error` 字段的结构化结果
- 模型拿到 error 后会告诉用户"操作失败",而不是崩溃
- 比如数学工具校验表达式合法性,非法字符直接返回错误

**陷阱**: 不要说"抛异常让上层处理"。工具错误应该返回结构化结果,让模型能理解并转达给用户。

---

### Q2.5 save_memory 工具怎么实现用户隔离?

**代码定位**: `src/lib/tools/index.ts:112-148`(`createTools(userId)` 工厂函数)

**回答思路**:
- 工具集是工厂函数,不是静态对象
- `createTools(userId)` 通过闭包把当前用户 ID 注入到 save_memory 的 execute
- 每个请求创建独立工具集,实现按用户隔离

**陷阱**: 这是个高级点。能讲清楚"为什么用闭包不用全局变量"会加分。

---

## 3. Memory 记忆系统

### Q3.1 短期记忆和长期记忆有什么区别?

**代码定位**: `src/lib/memory.ts:120`(manageMemory) vs `src/lib/memory-store.ts`(整个文件)

**回答思路**:
- **短期(上下文管理)**:管单次对话的 token,裁剪旧工具结果 + 长对话摘要,会话结束即失
- **长期(持久化)**:跨会话,存数据库,Agent 主动提取精简事实
- 两层互补,不冲突

---

### Q3.2 为什么要裁剪工具结果?

**代码定位**: `src/lib/memory.ts:72-106`(manageMemory 内部逻辑)

**回答思路**:
- 工具结果(如知识库检索)往往很长,但用完就不需要了
- 剥离旧工具结果能大幅省 token
- 如果消息还是太长,再触发摘要压缩早期对话

---

### Q3.3 持久化记忆怎么召回?

**代码定位**: `src/app/api/chat/route.ts:57-60` + `src/lib/memory-store.ts:124`

**回答思路**:
- 每轮对话开始,`getUserMemories(userId)` 读取用户所有记忆
- `formatMemoriesForPrompt` 拼成 system prompt 片段
- 记忆条目少时全量注入最优(简单可靠);多了再升级向量检索

**陷阱**: 不要说"存在前端 localStorage"。记忆是服务端状态,存数据库。

---

### Q3.4 怎么防止存垃圾记忆?

**代码定位**: `src/lib/tools/index.ts:118-131`(save_memory 的 description + content 上限)

**回答思路**:
- 两个机制:description 明确"不存寒暄、临时信息";content 限制 200 字
- save_memory 是 Agent 自主判断,不是规则触发
- 去重:相同 category + content 的记忆只更新不新增

---

## 4. MCP 协议

### Q4.1 MCP 解决什么问题?

**代码定位**: `src/mcp/server.ts:1-22`(文件头注释讲清楚了动机)

**回答思路**:
- 标准化工具定义,让工具和宿主解耦
- 传统做法:工具写死在应用代码里,换宿主就重写
- MCP:同一个 Server 能被 Claude Desktop、Cursor、自己的应用消费

---

### Q4.2 Tool / Resource / Prompt 三个原语的区别?

**代码定位**: `src/mcp/server.ts`(search_docs = Tool L42, list_documents = Tool L64)

**回答思路**:
- **Tool**:主动的,Agent 决定调用(动作)
- **Resource**:被动的,Client 按需读取(数据)
- **Prompt**:可复用的提示词模板

**陷阱**: 这个三选一面试必问。记住"Tool=动作,Resource=数据"就行。

---

### Q4.3 stdio 传输的原理和局限?

**代码定位**: `src/mcp/server.ts:134-136` + `src/app/api/mcp-chat/route.ts:68-80`

**回答思路**:
- Server 是独立进程,通过 stdin/stdout 收发 JSON-RPC
- stdout 是协议通道,日志只能写 stderr
- 局限:只能本地进程间通信。远程要用 SSE 或 HTTP 传输

---

### Q4.4 Client 怎么拿到 Server 的工具?

**代码定位**: `src/app/api/mcp-chat/route.ts:80-92`

**回答思路**:
- `createMCPClient({ transport })` 连接 Server
- `mcpClient.tools()` 发现 Server 暴露的所有工具
- 拿到的工具注入到 streamText 的 tools 参数,和本地工具用法一样

---

## 5. Multi-Agent 工作流

### Q5.1 为什么不用一个 Agent 做完所有事?

**代码定位**: `src/lib/agents.ts:17-19`(三个 Agent 的职责划分)

**回答思路**:
- 单 Agent 的 prompt 会很长,职责不清,容易遗忘指令
- 拆成多个 Agent,每个有明确角色和 system prompt
- 这叫 prompt 工程的分治思想

---

### Q5.2 Agent 之间怎么传递数据?

**代码定位**: `src/lib/agents.ts:119-124`(planContent 用 Output.object) + `247-255`(串联调用)

**回答思路**:
- 规划 Agent 用 Structured Output 输出结构化对象
- 研究/写作 Agent 直接用对象的字段,不用解析自然语言
- 类型安全,不会因为格式问题出错

---

### Q5.3 怎么实现流式进度展示?

**代码定位**: `src/app/api/workflow/route.ts:42-64`(ReadableStream + SSE)

**回答思路**:
- 用 ReadableStream + `text/event-stream`
- 每个 Agent 完成后,往流里写一条 SSE 事件(进度状态)
- 前端 EventSource 接收,实时更新"规划中→研究中→写作中"

---

## 6. Structured Output 结构化输出

### Q6.1 怎么让模型输出结构化数据?

**代码定位**: `src/app/api/analyze/route.ts:44-50`(generateText + Output.object)

**回答思路**:
- AI SDK 6 用 `generateText` + `output: Output.object({ schema })`
- schema 用 Zod 定义,模型按 schema 输出 JSON
- `generateObject` 在 v6 已废弃,迁移到这个写法

**陷阱**: 面试官可能问 `generateObject`。要说明 v6 的变化,显示你跟进了最新版本。

---

### Q6.2 为什么用 Zod 不用 JSON Schema 手写?

**代码定位**: `src/lib/schemas/analysis.ts`(sentimentSchema 定义)

**回答思路**:
- Zod 提供类型推导,TS 类型自动对齐
- AI SDK 自动把 Zod 转 JSON Schema 发给模型
- 一处定义,运行时校验 + 编译时类型 + 模型提示三合一

---

## 7. 认证与数据隔离

### Q7.1 认证怎么做的?

**代码定位**: `src/utils/supabase/server.ts:13` + `src/app/api/chat/route.ts:42-53`

**回答思路**:
- Supabase SSR Auth,双 Client 架构
- 服务端:`createServerClient` 从 cookie 读 session
- 浏览器:`createBrowserClient` 自动管 document.cookie
- Route Handler 里 `getUser()` 鉴权,拿 user.id 注入工具集

---

### Q7.2 token 过期怎么处理?

**代码定位**: `src/proxy.ts:12` + `src/utils/supabase/middleware.ts:47`

**回答思路**:
- proxy(Next.js 16 的 middleware)每个请求调 `getUser()`
- 触发 Supabase 静默刷新,新 token 写回 cookie
- 用户完全无感,不会突然掉线

**陷阱**: 不要说"前端定时刷新"。刷新在服务端 proxy 层做,前端无感。

---

### Q7.3 proxy 为什么不做路由守卫?

**代码定位**: `src/utils/supabase/middleware.ts:12`(注释说明了设计决策)

**回答思路**:
- proxy 对每个请求都跑(包括预取),只能做轻量操作
- 只做 session 续期,不做重逻辑
- 真正的授权在数据层用 `getUser()` 验证
- 这是 Next.js + Supabase 官方推荐的安全模式

---

### Q7.4 anon key 暴露在前端安全吗?

**回答思路**:
- 安全。anon key 是公开的,设计上就要暴露
- 安全靠 RLS(行级安全)策略保证:即使拿到 key,也只能访问自己的数据
- service_role key 才是敏感的,绝不放前端

---

## 8. TanStack Query 前端数据层

### Q8.1 为什么用 TanStack Query 不用 Redux?

**代码定位**: `src/app/knowledge/page.tsx:31`(useQuery 替代了手写 fetch)

**回答思路**:
- Redux 管客户端状态,TanStack Query 专管服务端状态缓存
- 两者不冲突,但这个项目没有复杂客户端状态
- Query 自带缓存/去重/后台刷新/乐观更新,省大量样板代码

---

### Q8.2 乐观更新怎么实现?

**代码定位**: `src/app/knowledge/page.tsx:83-103`(deleteMutation)

**回答思路**:
- `onMutate`:先从缓存移除文档,UI 立即变化
- `onError`:失败时拿 onMutate 返回的 previous,调 setQueryData 回滚
- `onSettled`:最终 invalidate 确保和服务端一致

**陷阱**: 三步缺一不可。只做 onMutate 不做 onError,失败时 UI 就错了。

---

### Q8.3 staleTime 和 gcTime 的区别?

**代码定位**: `src/components/providers/query-provider.tsx:23`(staleTime: 30s)

**回答思路**:
- **staleTime**:数据多久算"旧"。旧了会后台静默刷新,但 UI 先用旧数据
- **gcTime**(原 cacheTime):没人用之后多久从内存删掉
- 面试常考这俩的区别

**陷阱**: 不要混。staleTime 管"要不要刷新",gcTime 管"要不要删除"。

---

### Q8.4 QueryClient 为什么用 useState 创建?

**代码定位**: `src/components/providers/query-provider.tsx:20`

**回答思路**:
- Next.js SSR 下,模块级单例会在请求间共享 cache
- 导致用户 A 的数据串到用户 B 的请求(数据泄露)
- useState 保证每个 React 树(每个请求)拿到独立 client

**陷阱**: 这是 SSR 的经典坑。能讲清楚说明你理解 SSR 的数据隔离问题。

---

## 9. Next.js 与工程化

### Q9.1 Next.js 16 的 middleware 和 proxy 有什么区别?

**代码定位**: `src/proxy.ts`(注意是 proxy.ts 不是 middleware.ts)

**回答思路**:
- Next.js 16 把 `middleware.ts` 改名成 `proxy.ts`
- 函数名从 `middleware` 改成 `proxy`
- 功能一样,改名是为了更准确反映用途

**陷阱**: 能讲出这个改名,显示你用的是最新版本,不是老教程。

---

### Q9.2 NEXT_PUBLIC_ 环境变量什么时候生效?

**回答思路**:
- 构建时内联到客户端 bundle
- 运行时改 `.env.local` 不生效,必须重启 dev server
- `anon key` 是公开的(前端可见),安全靠 RLS

**陷阱**: 这是实战踩坑。加新环境变量后必须重启,否则 client 拿到 undefined。

---

### Q9.3 Server Component 和 Client Component 怎么划分?

**回答思路**:
- 默认 Server Component,只在需要交互时用 `"use client"`
- 登录表单、useChat、TanStack Query 是 Client Component
- API Route Handler 是服务端,但不叫 Component

---

### Q9.4 Drizzle 相比 Prisma 有什么优劣?

**代码定位**: `src/db/schema.ts`(Drizzle schema) + `src/db/index.ts`(连接)

**回答思路**:
- Drizzle 更贴近 SQL,类型推导更好,bundle 更小
- Prisma 生态成熟,有 GUI(Prisma Studio),但运行时较重
- 这个项目选 Drizzle 是为了和 pgvector 深度集成(原生支持 vector 类型)

---

### Q9.5 项目怎么部署的?

**回答思路**:
- Vercel 部署,连 GitHub 自动 CI/CD
- 环境变量在 Vercel Dashboard 配置
- Supabase 数据库托管,Drizzle ORM 用 connection pooler 连接

---

## 附:答题节奏建议

| 阶段 | 时长 | 内容 |
|---|---|---|
| 开场 | 30s | 项目总述(电梯演讲) |
| 深入 | 10-15min | 面试官选一个模块深挖 |
| 追问 | 5-10min | 基于你的回答继续追问 |
| 收尾 | 2-3min | 你有什么问题问面试官 |

**核心原则**: 每个回答都要能指着自己的代码讲。不要讲概念,讲"我这里是怎么做的、为什么这么做"。

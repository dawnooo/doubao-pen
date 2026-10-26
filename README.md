# 豆包代笔 doubao-pen

让豆包执笔，让 Codex 把关。

`doubao-pen` 是一个 Codex skill：Codex 提供写作提纲与事实材料，豆包生成中文正文，Codex 核查关键事实和逻辑，有实质问题再交豆包修改。最终措辞和语言风格保留豆包的表达。

## 为什么做这个 skill

这个项目起源于中文写作中的两个实际困扰：GPT 生成的中文有时带有翻译腔，读起来不太像中国人日常或正式写作中的表达；豆包的中文在一些场景中更合乎使用者的语言习惯，但单独使用时，也可能出现编造事实、引用失实、逻辑跳跃或结论过度的问题。

这个 skill 尝试将写作与核查分工：让豆包负责把内容写出来，让 Codex 负责组织思路、核对依据，并将发现的问题交回豆包修改。目标是兼顾自然的中文表达与内容可靠性；核查仍可能遗漏错误，不能保证消除所有幻觉。

## 如何分工

| 工作 | 负责方 |
| --- | --- |
| 写作目的、内容覆盖提纲、事实材料 | Codex |
| 正文、概念命名与定义、具体展开和措辞 | 豆包 |
| 关键事实、引用、计算及逻辑核查 | Codex |
| 根据核查意见修改正文 | 豆包 |
| LaTeX、Word 等格式转换、排版和文件生成 | Codex |

Codex 给豆包的指令以思路和内容覆盖范围为主，不先写示范段落或替换句，也不在拿回正文后自行润色。用户已经指定的术语、事实、风格和交付要求仍应保留。

## 默认行为

- 要求豆包客观表述，避免自吹自擂、宣传式拔高和缺乏依据的绝对化断言。
- 主要检查会影响结论的事实与逻辑，普通试写不自动升级为全面技术评审；没有实质问题就交付，不预设改稿轮数。
- 篇幅按用户或任务的明确要求执行。没有要求时，不自行限字、压缩或检查篇幅。
- 豆包只提供纯文本内容。公式、表格和引用可用普通文本表达含义；所有目标格式与文件由 Codex 完成。
- 通过后台 CLI 使用豆包网页版。提交后先做其他独立工作或间隔等待，再读取结果；不高频轮询、不向豆包催问。
- 遇到连接或登录问题时说明情况，不自动改为 Codex 代写或桌面鼠标键盘操作。

## 安装

需要 Codex、Git、Chrome、OpenCLI、匹配的 Browser Bridge 扩展，以及你自己的豆包页面会话。

将本仓库克隆到 Codex 的 skills 目录，目录名保留为 `doubao-pen`。默认位置是 `~/.codex/skills/`；如果设置了 `CODEX_HOME`，则使用它下面的 `skills/`。目标目录已存在时先核对或备份，避免覆盖本地修改。

macOS / Linux 或 Git Bash：

```bash
git clone https://github.com/dawnooo/doubao-pen.git ~/.codex/skills/doubao-pen
```

Windows PowerShell：

```powershell
git clone https://github.com/dawnooo/doubao-pen.git "$env:USERPROFILE\.codex\skills\doubao-pen"
```

确认安装后的路径为 `skills/doubao-pen/SKILL.md`。如果 Codex 尚未发现技能，重新加载技能或重新打开 Codex。

安装 OpenCLI，并按照 [OpenCLI 文档](https://opencli.info/)配置 Chrome 与 Browser Bridge。豆包侧的前置条件和命令见 [豆包适配器文档](https://opencli.info/docs/adapters/browser/doubao.html)。保持 Chrome 和扩展运行，必要的登录或验证码由用户完成。

可以先检查后台连接：

```powershell
opencli doubao status --window background -f json
```

页面可达不代表已能写作；以实际收到完整正文为准。这个流程需要浏览器会话运行，后台调用不占用桌面鼠标键盘。

## 使用

在 Codex 中输入：

> 使用 $doubao-pen，帮我写一段通用组合优化问题 GPU 加速框架的介绍。这是设计设想，没有实验数据。

也可以提供现有材料、明确篇幅或指定文档格式：

> 使用 $doubao-pen，依据我提供的材料写项目介绍，约800字。由豆包写正文，你核查事实和逻辑，最后生成 Word。

Codex 会先给豆包提纲和必要材料，等待生成后拿回正文。若存在关键事实或逻辑问题，将问题和依据交回豆包处理；通过核查后再交付或转换格式。

## 调用与验证

默认使用发送和读取分离的命令，保留同一会话进行返修：

```powershell
opencli doubao new --window background -f json
$brief = Get-Content -LiteralPath './brief.txt' -Raw -Encoding UTF8
opencli doubao send $brief --window background -f json
# 先留出生成时间，处理独立工作或等待，之后再读回。
opencli doubao read --window background -f json
```

普通短文可先预留约30—60秒，再读取一次；尚未完成则继续间隔等待，复杂任务适当延长。`正在思考`、部分正文或工具超时提示不算完成。详细处理方式见 [后台调用说明](references/background-cli.md)。

已在 Windows 与 OpenCLI 1.8.6 环境下验证过豆包网页版的后台写作、读回和多轮改稿，并完成 skill 格式校验。不同系统、浏览器状态和后续工具版本仍需按实际环境确认。

## 项目文件

```text
SKILL.md                        技能入口与写作分工
agents/openai.yaml              Codex 展示与调用提示
references/background-cli.md    后台发送、等待和读回规则
```

本仓库发布技能说明与文档，不包含运行账号、浏览器登录状态或私人写作材料。使用者应自行判断待发送材料是否适合交给豆包服务处理。

## 许可证

本仓库采用 [MIT License](LICENSE)。OpenCLI、Codex 和豆包各自遵循其许可证或服务条款。本项目为独立的协作流程配置，与相关产品官方无隶属关系。

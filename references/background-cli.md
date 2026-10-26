# 后台调用

使用前确认当前机器已安装 OpenCLI。使用它的豆包网页版适配器 `opencli doubao`，与桌面版适配器 `doubao-app` 区分。前置条件是可用的 Chrome Browser Bridge 连接和豆包页面会话；CLI 后台驱动页面，不占用桌面鼠标键盘，仍需 Chrome 和扩展运行。

先查看本机实际帮助，避免按过期参数调用：

```powershell
opencli doubao --help -f yaml
opencli doubao status --window background -f json
```

`Status=Connected` 只说明页面可达；`Login=Unknown` 不能证明已登录或已能生成。以实际收到完整答复为准。登录、验证码或权限门禁交用户处理，保持后台调用，不自行转用桌面控制或更改浏览器安全设置。

独立任务开始前新建对话；修订沿用当前会话。默认用 `send` 提交，等待后再 `read`，不使用会持续轮询答复的 `ask` 作为常规写作入口：

```powershell
opencli doubao new --window background -f json
$brief = Get-Content -LiteralPath '完整路径\brief.txt' -Raw -Encoding UTF8
opencli doubao send $brief --window background -f json
# 此处先留出生成时间，完成独立工作或可中断等待，到预定回读时间后再执行下一条。
opencli doubao read --window background -f json
```

使用变量把 UTF-8 文件全文作为一个参数传入，不将提纲拼接成可执行 shell 代码。`send` 成功只代表已提交，不代表正文已生成。

## 等待与回读

提交后记录时间，按任务量预留思考与生成时间：普通短文可先等约30—60秒，长文或复杂任务适当延长，再做首次回读。等待期间优先处理文件准备、已有材料整理等必要且不依赖正文的工作，不为填满等待时间扩大检索或审查范围。没有独立工作就使用可中断等待，单次阻塞等待不超过60秒；更长间隔分段等待并保持必要的进度沟通。

到预定时间读取一次。若仍在思考、生成或正文明显不完整，再等约30—60秒后查看，耗时较长时拉长间隔；不要每隔几秒调用 `read`、`status` 或其他状态检查，也不向豆包发送“写完了吗”等催问。若正文已完整并有结束迹象，直接拿回继续，不例行连续读取两遍来证明稳定。

默认站点会话可接续。等待期间保持原会话，不新建对话、不并行提交其他稿件。发送超时或结果未知，先留出合理时间，再读取确认是否已送达与仍在生成，之后决定是否重试；不要重复提交同一消息。工具返回的 `正在思考`、System 超时提示或部分正文不算完成。读取完整的 Assistant.Text，不把表格预览、旧答复、用户提示或思考内容当成新稿。遇到明确连接错误、登录门禁或长时间无进展时，按具体问题处理，不无限等待或密集重试。

页面转录可能附带 `Image:` 头像链接等界面元数据。保留原始返回，核实后可在交付副本中去掉这些非正文元素；不能据此删改正文句子，也不要下载头像等无关素材。

命令查找失败时，先检查当前机器的 OpenCLI 安装位置和 PATH；Windows 可用 `Get-Command opencli -ErrorAction SilentlyContinue` 查询。除非实际需要，不安装或升级工具、不新增浏览器扩展。

来源：[OpenCLI 豆包适配器文档](https://opencli.info/docs/adapters/browser/doubao.html)。现场验证情况以当前调用结果为准。

# 1. 基础参数
$ClientId    = "14d82eec-510b-4a4b-97d2-ee65d6ac45c1"
$RawRedirect = "https://login.microsoftonline.com/common/oauth2/nativeclient"
$RawScope    = "https://graph.microsoft.com/Mail.Read offline_access openid profile"

# 2. 提前进行标准的 URL 编码，防止特殊字符干扰
Add-Type -AssemblyName System.Web
$EncodedRedirect = [System.Web.HttpUtility]::UrlEncode($RawRedirect)
$EncodedScope    = [System.Web.HttpUtility]::UrlEncode($RawScope)

# 3. 干净地拼接最终的登录 URL
$AuthUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=$ClientId&scope=$EncodedScope&redirect_uri=$EncodedRedirect&response_type=code&prompt=select_account"

Write-Host "正在拉起微软官方安全登录窗口，请在弹窗中完成手动登录..." -ForegroundColor Cyan

# 4. 渲染 Windows Form 窗体
Add-Type -AssemblyName System.Windows.Forms
$Form = New-Object System.Windows.Forms.Form
$Form.Text = "企业邮箱手动登录测试"
$Form.Width = 600
$Form.Height = 700

$WebBrowser = New-Object System.Windows.Forms.WebBrowser
$WebBrowser.Dock = [System.Windows.Forms.DockStyle]::Fill
$Form.Controls.Add($WebBrowser)

# 5. 核心逻辑：拦截重定向并抠出 Code
$WebBrowser.add_Navigated({
    param($sender, $e)
    $CurrentUrl = $sender.Url.AbsoluteUri
    
    # 检测是否跳转到了官方的桌面端回调地址
    if ($CurrentUrl -like "*nativeclient?code=*") {
        Write-Host "`n[成功] 拦截到微软回调！" -ForegroundColor Green
        
        # 正则提取 Code 字符串
        $Code = ([regex]"code=([^&]+)").Match($CurrentUrl).Groups[1].Value
        Write-Host "成功截获的 Code 值为:`n" -ForegroundColor Yellow
        Write-Host $Code -ForegroundColor White
        
        # 关闭弹窗
        $Form.Close()
    }
})

# 启动并加载
$WebBrowser.Navigate($AuthUrl)
$Form.ShowDialog() | Out-Null
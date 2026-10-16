import UIKit
import WebKit

final class FreightViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let home = URL(string: "https://forte-frete.onrender.com/")!
    private var web: WKWebView!
    private var errorPanel: UIStackView!
    private var downloadFiles: [ObjectIdentifier: URL] = [:]

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Forte Frete"
        view.backgroundColor = .systemBackground
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Voltar", style: .plain, target: self, action: #selector(back))
        navigationItem.rightBarButtonItems = [
            UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(retry)),
            UIBarButtonItem(title: "Ajuda", style: .plain, target: self, action: #selector(help))
        ]
        let message = UILabel()
        message.text = "Não foi possível abrir o Forte Frete. Confira sua conexão e tente novamente."
        message.numberOfLines = 0
        message.textAlignment = .center
        let button = UIButton(type: .system)
        button.setTitle("Tentar novamente", for: .normal)
        button.addTarget(self, action: #selector(retry), for: .touchUpInside)
        errorPanel = UIStackView(arrangedSubviews: [message, button])
        errorPanel.axis = .vertical
        errorPanel.spacing = 20
        errorPanel.isHidden = true
        errorPanel.backgroundColor = .systemBackground
        errorPanel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorPanel)
        NSLayoutConstraint.activate([
            errorPanel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            errorPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            errorPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)
        ])
        web.load(URLRequest(url: home))
    }
    private func isAppURL(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == home.host && (url.port == nil || url.port == 443) && url.user == nil
    }
    @objc private func back() { if web.canGoBack { web.goBack() } }
    @objc private func retry() {
        errorPanel.isHidden = true
        web.isHidden = false
        if let url = web.url, isAppURL(url) { web.reload() } else { web.load(URLRequest(url: home)) }
    }
    @objc private func help() { web.load(URLRequest(url: home.appendingPathComponent("suporte.html"))) }
    private func failed() { web.isHidden = true; errorPanel.isHidden = false }
    private func external(_ url: URL) {
        guard ["https", "tel", "mailto", "whatsapp"].contains(url.scheme ?? "") else { return }
        UIApplication.shared.open(url, options: [:])
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if isAppURL(url) {
            if action.shouldPerformDownload { decisionHandler(.download) }
            else if action.targetFrame == nil { web.load(action.request); decisionHandler(.cancel) }
            else { decisionHandler(.allow) }
        } else if url.scheme == "blob" && action.shouldPerformDownload && action.sourceFrame.isMainFrame {
            decisionHandler(.download)
        } else {
            if action.targetFrame?.isMainFrame != false { external(url) }
            decisionHandler(.cancel)
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let attachment = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true
        decisionHandler(!response.canShowMIMEType || attachment ? .download : .allow)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { failed() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { failed() }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { errorPanel.isHidden = true }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { failed() }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { if isAppURL(url) { web.load(action.request) } else { external(url) } }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "Forte Frete", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "Confirmar", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Confirmar", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent((suggestedFilename as NSString).lastPathComponent)
            downloadFiles[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch { completionHandler(nil) }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloadFiles.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = view
        share.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        present(share, animated: true)
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloadFiles.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        let alert = UIAlertController(title: "Documento indisponível", message: "Tente abrir o documento novamente.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

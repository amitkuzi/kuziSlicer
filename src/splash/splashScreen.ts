import * as vscode from 'vscode';
import * as path from 'path';
import { brandConfig } from '../brandkit-config';

export class SplashScreen {
	private panel: vscode.WebviewPanel | undefined;
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Show splash screen on first activation
	 */
	show(): void {
		// Check if we should show splash (first activation)
		const splashShown = this.context.globalState.get<boolean>('kuziSlicer.splashShown');
		if (splashShown) {
			return;
		}

		// Create webview panel
		this.panel = vscode.window.createWebviewPanel(
			'kuziSlicer.splash',
			'kuziSlicer',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.file(path.join(this.context.extensionPath, 'brandkit')),
				],
			}
		);

		// Set HTML content
		this.panel.webview.html = this.getWebviewContent();

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage((message) => {
			if (message.command === 'openWelcome') {
				vscode.commands.executeCommand('kuziSlicer.helloWorld');
				this.panel?.dispose();
			} else if (message.command === 'dismiss') {
				this.panel?.dispose();
			}
		});

		// Mark splash as shown
		this.context.globalState.update('kuziSlicer.splashShown', true);

		// Cleanup on panel close
		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});
	}

	/**
	 * Generate webview HTML content
	 */
	private getWebviewContent(): string {
		const logoUri = this.panel!.webview.asWebviewUri(
			vscode.Uri.file(path.join(this.context.extensionPath, 'brandkit', 'logos', 'logo.svg'))
		);

		const fontsUri = this.panel!.webview.asWebviewUri(
			vscode.Uri.file(path.join(this.context.extensionPath, 'brandkit', 'fonts', 'fonts.css'))
		);

		const colorsUri = this.panel!.webview.asWebviewUri(
			vscode.Uri.file(path.join(this.context.extensionPath, 'brandkit', 'colors', 'colors.css'))
		);

		const version = this.context.extension?.packageJSON?.version || '0.0.1';
		const { ember, ground, base, fg, onEmber } = {
			ember: '#E4632D',
			ground: '#F4EFE7',
			base: '#221E1A',
			fg: '#221E1A',
			onEmber: '#1A1210',
		};

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>kuziSlicer - Get Started</title>
	<link rel="stylesheet" href="${fontsUri}">
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			background: linear-gradient(135deg, ${ground} 0%, #ffffff 100%);
			color: ${fg};
			font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}

		.splash-container {
			background: white;
			border-radius: 12px;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
			max-width: 500px;
			width: 100%;
			padding: 60px 40px;
			text-align: center;
			animation: fadeIn 0.6s ease-in-out;
		}

		@keyframes fadeIn {
			from {
				opacity: 0;
				transform: translateY(20px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		.logo {
			margin-bottom: 30px;
			animation: slideDown 0.8s ease-out;
		}

		@keyframes slideDown {
			from {
				opacity: 0;
				transform: translateY(-20px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}

		.logo img {
			width: 80px;
			height: 80px;
		}

		h1 {
			font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 32px;
			font-weight: 700;
			margin-bottom: 12px;
			color: ${base};
		}

		.version {
			font-size: 14px;
			color: #6E6357;
			margin-bottom: 24px;
		}

		.description {
			font-size: 16px;
			color: #6E6357;
			line-height: 1.6;
			margin-bottom: 40px;
		}

		.actions {
			display: flex;
			gap: 12px;
			justify-content: center;
		}

		button {
			padding: 12px 24px;
			border: none;
			border-radius: 6px;
			font-size: 14px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.2s ease;
			font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		}

		.btn-primary {
			background: ${ember};
			color: ${onEmber};
			flex: 1;
		}

		.btn-primary:hover {
			background: #d84f1e;
			transform: translateY(-2px);
			box-shadow: 0 8px 24px rgba(228, 99, 45, 0.3);
		}

		.btn-secondary {
			background: transparent;
			color: ${fg};
			border: 2px solid ${ground};
		}

		.btn-secondary:hover {
			background: ${ground};
		}

		.close-btn {
			position: absolute;
			top: 20px;
			right: 20px;
			background: transparent;
			color: ${fg};
			border: none;
			font-size: 24px;
			cursor: pointer;
			padding: 0;
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 4px;
			transition: background 0.2s ease;
		}

		.close-btn:hover {
			background: ${ground};
		}

		.splash-wrapper {
			position: relative;
		}
	</style>
</head>
<body>
	<div class="splash-wrapper">
		<button class="close-btn" id="closeBtn" title="Dismiss">✕</button>
		<div class="splash-container">
			<div class="logo">
				<img src="${logoUri}" alt="kuziSlicer Logo">
			</div>
			<h1>kuziSlicer</h1>
			<div class="version">v${version}</div>
			<p class="description">
				A powerful VSCode extension for optimizing your 3D printing workflow.
			</p>
			<div class="actions">
				<button class="btn-primary" id="getStartedBtn">Get Started</button>
				<button class="btn-secondary" id="skipBtn">Later</button>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		document.getElementById('getStartedBtn').addEventListener('click', () => {
			vscode.postMessage({ command: 'openWelcome' });
		});

		document.getElementById('skipBtn').addEventListener('click', () => {
			vscode.postMessage({ command: 'dismiss' });
		});

		document.getElementById('closeBtn').addEventListener('click', () => {
			vscode.postMessage({ command: 'dismiss' });
		});
	</script>
</body>
</html>`;
	}
}

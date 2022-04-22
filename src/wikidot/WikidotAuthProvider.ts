import type { AuthenticationProvider, AuthenticationSession } from "vscode";
import * as vscode from "vscode";
import { Session, login, getUserInfo } from "./interface";

/**
 * Represents a session of a currently logged in Wikidot user.
 */
interface WikidotSession extends AuthenticationSession {
	expire: string,
	expireDate: Date,
}

/**
 * A provider for performing authentication to Wikidot service.
 */
class WikidotAuthProvider implements AuthenticationProvider {
	private sessions = new Map<string, WikidotSession>();
	private context: vscode.ExtensionContext;
	onDidChangeSessions = () => { return { dispose() { } }; };

  constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.restoreSessions();
	};

	async getSessions(scopes?: readonly string[]): Promise<WikidotSession[]> {
		let sessionArray = [...this.sessions.values()];
		for (let i = 0; i < sessionArray.length; i++) {
			if (sessionArray[i].expireDate.getTime() < Date.now()) {
				let choice = await vscode.window.showWarningMessage(
					`${sessionArray[i].account.label}'s login session has expired.`,
					"Sign in again")
				if (choice) {
					try {
						await this.createSession([], sessionArray[i].account.label);
					} catch (_) {
						await this.removeSession(sessionArray[i].id);
					}
				} else {
					await this.removeSession(sessionArray[i].id);
				}
			};
		}
		if (!scopes?.length) {
			return [...this.sessions.values()];
		} else return [this.sessions.get(scopes[0])!];
	}

	async createSession(scope?: readonly string[], username?: string): Promise<WikidotSession> {
		let cancel = "Login dialog cancelled";
		let retry = 0;
		let newUsername: string | undefined;
		let sessinfo: Session;
		let e: Error;
		while (retry != -1) {
			newUsername = await vscode.window.showInputBox({
				title: "Login to wikidot",
				placeHolder: "Your wikidot username",
				value: username,
				prompt: retry ? e.message : undefined,
			})
			if (!newUsername) throw cancel;
			let password = await vscode.window.showInputBox({
				title: "Login to wikidot",
				placeHolder: "Your wikidot password",
				password: true,
			})
			if (!password) throw cancel;
			try {
				sessinfo = await login(newUsername, password);
				retry = -1;
			} catch (err) {
				retry = 1;
				e = err;
			}
		}
    let user = await getUserInfo(newUsername!);

		const session = {
			scopes: [],
			id: `${user.id}`,
			account: {
				label: `${user.name}`,
				id: `${user.id}`,
			},
			accessToken: sessinfo!.session_auth,
      expire: sessinfo!.session_expire,
      expireDate: sessinfo!.session_expire_date,
		};
		this.sessions.set(`${user.id}`, session);
		await this.storeSessions();
		return session;
	}

	async removeSession(userId: string): Promise<void> {
		this.sessions.delete(userId);
		await this.storeSessions();
	}

	async restoreSessions(): Promise<void> {
		let stored = await this.context.secrets.get("wikidot.auth") ?? "[]";
		let sessions: WikidotSession[] = JSON.parse(stored);
		for (let i = 0; i < sessions.length; i++) {
			sessions[i].expireDate = new Date(sessions[i].expireDate);
			this.sessions.set(sessions[i].id, sessions[i]);
		}
	}

	async storeSessions(): Promise<void> {
		let sessionArray = [...this.sessions.values()];
		return await this.context.secrets.store("wikidot.auth", JSON.stringify(sessionArray))
	}
}

export default WikidotAuthProvider;
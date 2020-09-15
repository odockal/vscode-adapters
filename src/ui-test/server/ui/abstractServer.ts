import { ViewItem, By, VSBrowser, TreeItem } from "vscode-extension-tester";
import { DialogHandler } from "vscode-extension-tester-native";
import { IServer } from "./IServer";
import { ServerState } from "../../common/enum/serverState";
import { serverHasState, serverStateChanged } from "../../common/util/serverUtils";
import { AdaptersConstants } from "../../common/adaptersContants";

/**
 * @author Ondrej Dockal <odockal@redhat.com>
 */
export abstract class AbstractServer implements IServer {

    private _serverName: string;

    constructor(name: string) {
        this._serverName = name;
    }

    public get serverName(): string {
        return this._serverName;
    }
    public set serverName(value: string) {
        this._serverName = value;
    }

    public async getServerStateLabel(): Promise<string> {
        const treeItem = await this.getTreeItem();
        const element = await treeItem.findElement(By.className('label-description'));
        // https://stackoverflow.com/questions/23804123/selenium-gettext
        // const text = await element.getText();
        const text = await element.getAttribute('innerHTML');
        return text.slice(text.indexOf('(') + 1, text.indexOf(')'));
    }

    public async getServerState(): Promise<ServerState> {
        const label = (await this.getServerStateLabel());
        return ServerState[label];
    }

    public async getServerName(): Promise<string> {
        const item = (await this.getTreeItem()) as TreeItem;
        if (!item) {
            throw Error('TreeItem of the object in undefined');
        }
        return item.getLabel();
    }

    protected async performServerOperation(contextMenuItem: string, expectedState: ServerState, timeout: number): Promise<void> {
        const treeItem = await this.getTreeItem();
        await treeItem.select();
        if (!(await treeItem.isSelected())) {
            await treeItem.select();
        }
        const oldState = await this.getServerState();
        const menu = await treeItem.openContextMenu();
        await VSBrowser.instance.driver.wait(async () => await menu.hasItem(contextMenuItem), 2000);
        await new Promise(res => setTimeout(res, 1000));
        await menu.select(contextMenuItem);
        try {
            await VSBrowser.instance.driver.wait(async () => await serverStateChanged(this, oldState), 3000);
        } catch (error) {
            const menu = await treeItem.openContextMenu();
            await menu.select(contextMenuItem);
        }
        await VSBrowser.instance.driver.wait(
            async () => await serverHasState(this, expectedState),
            timeout,
            'Failed to get expected server state ' + ServerState[expectedState] + ' for ' + await this.getServerName() + ', actual state was ' + ServerState[await this.getServerState()]);
    }

    public async start(timeout: number = 10000): Promise<void> {
        await this.performServerOperation(AdaptersConstants.RSP_SERVER_PROVIDER_START, ServerState.Started, timeout);
    }

    public async stop(timeout: number = 10000): Promise<void> {
        await this.performServerOperation(AdaptersConstants.RSP_SERVER_PROVIDER_STOP, ServerState.Stopped, timeout);
    }

    public async terminate(timeout: number = 10000): Promise<void> {
        await this.performServerOperation(AdaptersConstants.RSP_SERVER_PROVIDER_TERMINATE, ServerState.Stopped, timeout);
    }

    public async delete(): Promise<void> {
        const serverItem = await this.getTreeItem();
        const menu = await serverItem.openContextMenu();
        if (await menu.hasItem(AdaptersConstants.SERVER_REMOVE)) {
            await (await menu.getItem(AdaptersConstants.SERVER_REMOVE)).click();
            const dialog = await DialogHandler.getOpenDialog();
            await dialog.confirm();
        } else {
            throw Error('Given server ' + this.getServerName() + 'does not allow to remove the server in actual state, could be started');
        }
    }

    protected abstract getTreeItem(): Promise<ViewItem>;
}

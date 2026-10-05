import {
  GUI,
  GUIEvent,
  GUIProfiles,
  GuiProfile,
  GuiScroll,
  GuiTreeView,
  GuiDrawingPanel,
} from '@bornengine/engine';
import {
  GUI as GUIFromSubpath,
  GuiProfile as GuiProfileFromSubpath,
  GUIProfiles as GUIProfilesFromSubpath,
  GuiScroll as GuiScrollFromSubpath,
  GuiTreeView as GuiTreeViewFromSubpath,
} from '@bornengine/engine/gui';

class InventoryScroll extends GuiScroll {
  protected override onAction(_event: GUIEvent): void {}
}

const rootControl: GUI = new InventoryScroll();
const subpathControl: GUIFromSubpath = new GuiScrollFromSubpath().center();
const rootProfile: GuiProfile = GUIProfiles.clone('button');
const subpathProfile: GuiProfileFromSubpath = GUIProfilesFromSubpath.get('tree');
const rootTree: GuiTreeView = new GuiTreeView();
const subpathTree: GuiTreeViewFromSubpath = new GuiTreeViewFromSubpath();
rootTree.addNodeByPath('Inventory/Weapons/Sword', 1);
subpathTree.addNode('Armor', 'armor');
const drawingPanel: GuiDrawingPanel = new GuiDrawingPanel();
drawingPanel.drawLine({ x: 0, y: 0 }, { x: 1, y: 1 }, { r: 1, g: 1, b: 1, a: 1 });

void rootControl;
void subpathControl;
void rootProfile;
void subpathProfile;

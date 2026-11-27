import { Color, Label, Node, UITransform, Widget } from 'cc';

/** A line of text along the bottom of the screen, under `parent` (a full-screen node). */
export function statusLine(parent: Node, text = ''): Label {
  const node = new Node('Status');
  node.layer = parent.layer;
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(900, 40);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = 22;
  label.lineHeight = 28;
  label.color = new Color(220, 226, 240, 255);
  const widget = node.addComponent(Widget);
  widget.isAlignBottom = true;
  widget.isAlignHorizontalCenter = true;
  widget.bottom = 24;
  return label;
}

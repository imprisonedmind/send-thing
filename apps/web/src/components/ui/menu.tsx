// Ported subset of T3 Code's Base UI menu. See THIRD_PARTY_NOTICES.md.
import { Menu as Primitive } from "@base-ui/react/menu";

export const Menu = Primitive.Root;
export const MenuTrigger = Primitive.Trigger;
export const MenuGroup = Primitive.Group;
export function MenuPopup({
  children,
  side = "bottom",
  align = "start",
  ...props
}: Primitive.Popup.Props & {
  side?: Primitive.Positioner.Props["side"];
  align?: Primitive.Positioner.Props["align"];
}) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner
        side={side}
        align={align}
        sideOffset={6}
        className="menu-positioner"
      >
        <Primitive.Popup
          {...props}
          data-slot="menu-popup"
          className={`menu-popup ${props.className ?? ""}`}
        >
          <div className="menu-scroll">{children}</div>
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}
export function MenuItem(props: Primitive.Item.Props) {
  return (
    <Primitive.Item
      {...props}
      className={`menu-item ${props.className ?? ""}`}
    />
  );
}
export function MenuLabel(props: Primitive.GroupLabel.Props) {
  return <Primitive.GroupLabel {...props} className="menu-label" />;
}
export function MenuSeparator() {
  return <Primitive.Separator className="menu-separator" />;
}

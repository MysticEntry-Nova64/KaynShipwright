import type { DesktopAPI } from "./desktop-api";

export function installStartup(desktop: DesktopAPI | undefined) {
  const dialog = document.getElementById("locationDialog") as HTMLDialogElement;
  const status = document.getElementById("locationStatus")!;
  const choose = document.getElementById("locationChoose") as HTMLButtonElement;
  const later = document.getElementById("locationLater") as HTMLButtonElement;
  const notice = document.getElementById("instanceNotice")!;
  const show = (message: string) => {
    notice.hidden = false;
    document.getElementById("instanceMessage")!.textContent = message;
  };
  document.getElementById("instanceDismiss")!.onclick = () => {
    notice.hidden = true;
  };
  desktop?.onAlreadyOpen(() =>
    show("Shipwright is already open. Only one instance can run at a time."),
  );
  later.onclick = () => dialog.close();
  choose.onclick = async () => {
    choose.disabled = later.disabled = true;
    try {
      const result = await desktop!.chooseStarsectorLocation();
      if (result) dialog.close();
      else
        status.textContent =
          "No folder selected. You can try again or choose Later.";
    } catch (error) {
      status.textContent = String(error).replace(
        /^Error: Error invoking remote method '[^']+': (?:Error: )?/,
        "",
      );
    } finally {
      choose.disabled = later.disabled = false;
    }
  };
  if (desktop)
    void desktop
      .starsectorLocation()
      .then((result) => {
        if (result.needsSelection) {
          status.textContent =
            result.warning ||
            "Select the folder that contains starsector-core. You can change it later from the import browser.";
          dialog.showModal();
        }
      })
      .catch((error) => {
        status.textContent = `Could not check the saved location: ${error}`;
        dialog.showModal();
      });
}

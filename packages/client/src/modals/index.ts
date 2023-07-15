export let isModalPopupActive = false;

const closeModalPopup = (accepted?: boolean) => {
    isModalPopupActive = false;
    const popup = document.getElementById("popup");

    const value = (document.getElementById("popupInput") as HTMLInputElement).value;
    const resolve = popupResolve;
    const reject = popupReject;
    popupResolve = undefined;
    popupReject = undefined;
    if (accepted) {
        if (resolve) {
            resolve(value);
        }
    } else {
        if (reject) {
            reject("dismiss");
        }
    }
    if (popup) {
        popup.style.opacity = "0";
        setTimeout(() => {
            popup.style.visibility = "hidden";
        }, 300);
        const popupFrame = document.getElementById("popupFrame");
        if (popupFrame) {
            popupFrame.style.transform = "translate(-50%,-100%)";
        }
    }
};

let popupResolve: undefined | ((v: string) => void);
let popupReject: undefined | ((err: string) => void);
export const modalPopup = (options: {title: string; desc: string; value?: string}): Promise<string> => {
    document.getElementById("popupTitle").innerText = options.title;
    document.getElementById("popupDesc").innerText = options.desc;
    const input = document.getElementById("popupInput") as HTMLInputElement;
    if (options.value != null) {
        input.value = options.value;
        input.style.visibility = "visible";
    } else {
        input.style.visibility = "hidden";
    }
    return new Promise((resolve, reject) => {
        popupResolve = resolve;
        popupReject = reject;
        openModalPopup();
    });
};

const openModalPopup = () => {
    isModalPopupActive = true;
    const popup = document.getElementById("popup");
    if (popup) {
        popup.style.visibility = "visible";
        popup.style.opacity = "1";
        const popupFrame = document.getElementById("popupFrame");
        if (popupFrame) {
            popupFrame.style.transform = "translate(-50%,-50%)";
        }
        document.getElementById("popupInput").focus();
    }
};

const onBackdropClicked = e => {
    if (e.eventPhase === Event.AT_TARGET) {
        closeModalPopup();
    }
};

const onAcceptClicked = () => {
    //
    closeModalPopup(true);
};

const onDiscardClicked = () => {
    //
    closeModalPopup();
};

export const initModals = () => {
    const d = document;
    const backdrop = d.createElement("div");
    backdrop.id = "popup";
    backdrop.style.visibility = "hidden";
    backdrop.style.opacity = "0";
    backdrop.style.position = "absolute";
    backdrop.style.top = "0px";
    backdrop.style.left = "0px";
    backdrop.style.width = "100%";
    backdrop.style.height = "100%";
    backdrop.style.backgroundColor = "rgba(0,0,0,0.5)";
    //backdrop.style.backdropFilter = "blur(8px)";
    backdrop.style.transition = "visibility 0s, opacity 0.2s 0.1s ease-in";
    backdrop.onclick = onBackdropClicked;
    d.body.appendChild(backdrop);

    const layer = d.createElement("div");
    backdrop.appendChild(layer);
    layer.id = "popupFrame";
    layer.style.position = "absolute";
    layer.style.left = "50%";
    layer.style.top = "50%";
    layer.style.width = "50%";
    //layer.style.minHeight = "50%";
    layer.style.transform = "translate(-50%,-100%)";
    layer.style.backgroundColor = "#111";
    layer.style.boxShadow = "0px 4px 8px rgba(0,0,0,0.2)";
    layer.style.borderRadius = "16px";
    layer.style.textAlign = "center";
    layer.style.fontFamily = "monospace";
    layer.style.padding = "10px";
    layer.style.border = "solid";
    layer.style.borderColor = "#ccc";
    layer.style.borderWidth = "1pt";
    layer.style.transition = "transform 0.3s ease-in";

    const title = d.createElement("h1");
    title.id = "popupTitle";
    title.style.color = "red";
    title.innerText = "Title";
    title.style.margin = "0";
    layer.appendChild(title);

    const desc = d.createElement("h3");
    desc.id = "popupDesc";
    desc.innerText = "Long long description";
    desc.style.color = "lightcyan";
    layer.appendChild(desc);

    const input = d.createElement("input");
    input.id = "popupInput";
    input.type = "text";
    input.style.minWidth = "90%";
    input.style.width = "90%";
    input.style.padding = "8px 16px";
    input.style.fontFamily = "monospace";
    input.style.background = "none";
    input.style.borderRadius = "16px";
    input.style.color = "#fff";
    input.style.outline = "inherit";
    input.style.borderColor = "#fff";
    input.style.borderWidth = "2pt";
    input.onkeydown = e => {
        if (e.key === "Enter") {
            closeModalPopup(true);
        } else if (e.key === "Escape") {
            closeModalPopup(false);
        }
    };
    layer.appendChild(input);

    const buttonsLine = d.createElement("p");
    buttonsLine.style.width = "100%";
    layer.appendChild(buttonsLine);

    const accept = d.createElement("button");
    accept.innerText = "Accept";
    accept.style.float = "right";
    accept.style.padding = "8px 16px";
    accept.style.marginLeft = "8px";
    accept.style.fontFamily = "monospace";
    accept.style.background = "none";
    accept.style.borderRadius = "16px";
    accept.style.color = "#fff";
    accept.style.outline = "inherit";
    accept.style.borderColor = "#fff";
    accept.style.borderWidth = "2pt";
    accept.onclick = onAcceptClicked;
    buttonsLine.appendChild(accept);

    const cancel = d.createElement("button");
    cancel.innerText = "Discard";
    cancel.style.float = "right";
    cancel.style.padding = "8px 16px";
    cancel.style.marginLeft = "8px";
    cancel.style.fontFamily = "monospace";
    cancel.style.color = "#f00";
    cancel.style.outline = "inherit";
    cancel.style.background = "none";
    cancel.style.border = "solid";
    cancel.style.borderRadius = "16px";
    cancel.style.borderColor = "#f00";
    cancel.style.borderWidth = "2pt";
    cancel.onclick = onDiscardClicked;
    buttonsLine.appendChild(cancel);
};

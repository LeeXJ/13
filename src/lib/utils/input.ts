export class Pointer {
    id_ = 0;
    startX_ = 0;
    startY_ = 0;
    prevX_ = 0;
    prevY_ = 0;
    x_ = 0;
    y_ = 0;
    down_ = false;
    active_ = false;
}

const pointers: Pointer[] = [];
export const inputPointers = pointers;
export const keyboardState: Record<string, number> = {};
export let keyboardDown: Record<string, number> = {};
export let keyboardUp: Record<string, number> = {};

export function getPointer(id: number): Pointer {
    for (let i = 0; i < pointers.length; ++i) {
        if (pointers[i].id_ === id) {
            return pointers[i];
        }
    }
    const pointer = new Pointer();
    pointer.id_ = id;
    pointers.push(pointer);
    return pointer;
}

function handleDown(pointer: Pointer, x: number, y: number) {
    pointer.x_ = x;
    pointer.y_ = y;
    pointer.prevX_ = x;
    pointer.prevY_ = y;
    pointer.startX_ = x;
    pointer.startY_ = y;
    pointer.down_ = true;
    pointer.active_ = true;
}

function handleMove(pointer: Pointer, x: number, y: number) {
    pointer.prevX_ = pointer.x_;
    pointer.prevY_ = pointer.y_;
    pointer.x_ = x;
    pointer.y_ = y;
}

function handleUp(pointer: Pointer) {
    pointer.down_ = false;
    pointer.active_ = false;
}

export function initInput(canvas: HTMLCanvasElement) {
    oncontextmenu = e => e.preventDefault();
    const handleMouse = (e: MouseEvent, fn: (pointer: Pointer, x: number, y: number) => void) => {
        const scale = canvas.width / canvas.clientWidth;
        const bb = canvas.getBoundingClientRect();
        fn(getPointer(-1),
            ((e.clientX - bb.x) * scale) | 0,
            ((e.clientY - bb.y) * scale) | 0);
    };
    canvas.addEventListener("mousedown", (e) => {
        handleMouse(e, handleDown);
    }, false);

    canvas.addEventListener("mouseup", (e) => {
        handleUp(getPointer(-1));
        e.preventDefault();
    }, false);

    canvas.addEventListener("mouseleave", (e) => {
        handleUp(getPointer(-1));
    }, false);

    canvas.addEventListener("mouseenter", (e) => {
        if (e.buttons) {
            handleMouse(e, handleDown);
        }
    }, false);

    canvas.addEventListener("mousemove", (e) => {
        handleMouse(e, handleMove);
    }, false);

    const handleTouchEvent = (e: TouchEvent, fn: (pointer: Pointer, x: number, y: number) => void) => {
        e.preventDefault();
        const scale = canvas.width / canvas.clientWidth;
        const bb = canvas.getBoundingClientRect();
        for (let i = 0; i < e.changedTouches.length; ++i) {
            const touch = e.changedTouches.item(i)!;
            fn(getPointer(touch.identifier),
                ((touch.clientX - bb.x) * scale) | 0,
                ((touch.clientY - bb.y) * scale) | 0);
        }
    };
    canvas.addEventListener("touchstart", (e) => {
        handleTouchEvent(e, handleDown);
    }, false);
    canvas.addEventListener("touchmove", (e) => {
        handleTouchEvent(e, handleMove);
    }, false);
    const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; ++i) {
            const touch = e.changedTouches.item(i)!;
            handleUp(getPointer(touch.identifier));
        }
    };
    canvas.addEventListener("touchend", onTouchEnd, false);

    const wnd = document;
    //wnd.addEventListener("keypress", onKey, true);
    wnd.addEventListener("keydown", (e) => {
        e.preventDefault();
        keyboardDown[e.code] = +(!keyboardState[e.code]);
        keyboardState[e.code] = 1;
    }, false);
    wnd.addEventListener("keyup", (e) => {
        e.preventDefault();
        keyboardUp[e.code] = +(!!keyboardState[e.code]);
        keyboardState[e.code] = 0;
    }, false);
}

export function resetInput() {
    keyboardDown = {};
    keyboardUp = {};
}
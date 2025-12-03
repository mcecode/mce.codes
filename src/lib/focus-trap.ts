export default class FocusTrap {
	static #isLocked = false;
	static #currentKey = "";

	#container: HTMLElement;
	#key: string;
	#listener: (e: KeyboardEvent) => void;

	constructor(container: HTMLElement, start: HTMLElement, end: HTMLElement) {
		this.#container = container;
		this.#key = crypto.getRandomValues(new Uint8Array(10)).join("");
		this.#listener = (e) => {
			if (e.key.toLowerCase() !== "tab") {
				return;
			}

			if (e.shiftKey && document.activeElement === start) {
				e.preventDefault();
				end.focus();
				return;
			}

			if (!e.shiftKey && document.activeElement === end) {
				e.preventDefault();
				start.focus();
			}
		};
	}

	get isLocked() {
		return FocusTrap.#isLocked;
	}

	lock() {
		if (FocusTrap.#isLocked) {
			throw new Error("Focus trap is already locked.");
		}

		addEventListener("keydown", this.#listener);
		FocusTrap.#isLocked = true;
		FocusTrap.#currentKey = this.#key;

		this.#hideElements(document.body, this.#container);
	}

	#hideElements(root: Element, exception: Element) {
		for (const child of root.children) {
			if (child === exception) {
				continue;
			}

			if (child.contains(exception)) {
				this.#hideElements(child, exception);
				continue;
			}

			child.setAttribute("aria-hidden", "true");
		}
	}

	unlock() {
		if (!FocusTrap.#isLocked) {
			return;
		}

		if (FocusTrap.#currentKey !== this.#key) {
			throw new Error("Cannot unlock a lock set by another focus trap.");
		}

		removeEventListener("keydown", this.#listener);
		FocusTrap.#isLocked = false;
		FocusTrap.#currentKey = "";

		this.#unhideElements(document.body, this.#container);
	}

	#unhideElements(root: Element, exception: Element) {
		for (const child of root.children) {
			if (child === exception) {
				continue;
			}

			if (child.contains(exception)) {
				this.#hideElements(child, exception);
				continue;
			}

			child.removeAttribute("aria-hidden");
		}
	}

	toggleLock() {
		if (FocusTrap.#isLocked) {
			this.unlock();
			return;
		}

		this.lock();
	}
}

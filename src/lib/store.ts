export default class Store<T extends string> {
	#key: string;

	constructor(key: string) {
		this.#key = key;
	}

	get(): T | null {
		return localStorage.getItem(this.#key) as T | null;
	}

	set(value: T) {
		localStorage.setItem(this.#key, value);
	}
}

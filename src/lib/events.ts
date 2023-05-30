type Handler<T> = (data: T, timesDispatched: number) => void;

class AppEvent<T> {
  #handlers = new Set<Handler<T>>();
  #timesDispatched: number = 0;

  #latestData: T | undefined;
  get latestData() {
    return this.#latestData;
  }

  addHandler(handler: Handler<T>) {
    this.#handlers.add(handler);
  }

  dispatch(data: T) {
    this.#latestData = data;

    this.#handlers.forEach((handler) => {
      handler(data, this.#timesDispatched);
    });

    this.#timesDispatched++;
  }
}

export const modeChange = new AppEvent<string>();

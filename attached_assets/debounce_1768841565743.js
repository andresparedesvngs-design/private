class Debounce {
    constructor() {
        this.timeouts = new Map();
    }

    execute(id, func, wait) {
        // Limpiar timeout existente
        if (this.timeouts.has(id)) {
            clearTimeout(this.timeouts.get(id));
        }

        // Establecer nuevo timeout
        const timeoutId = setTimeout(() => {
            func();
            this.timeouts.delete(id);
        }, wait);

        this.timeouts.set(id, timeoutId);
    }

    cancel(id) {
        if (this.timeouts.has(id)) {
            clearTimeout(this.timeouts.get(id));
            this.timeouts.delete(id);
        }
    }

    // Debounce estático para uso rápido
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

window.Debounce = Debounce;
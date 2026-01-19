class Helpers {
    static escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    static formatPhoneNumber(phone) {
        if (!phone) return 'Desconocido';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 9) {
            return `+56 ${cleaned.substring(0, 1)} ${cleaned.substring(1, 5)} ${cleaned.substring(5)}`;
        }
        return phone;
    }

    static formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        } else if (diff < 7 * 24 * 60 * 60 * 1000) {
            return date.toLocaleDateString('es-ES', { weekday: 'short' });
        } else {
            return date.toLocaleDateString('es-ES');
        }
    }

    static getInitial(text) {
        return text ? text.charAt(0).toUpperCase() : '?';
    }

    static formatCurrency(amount) {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP'
        }).format(amount);
    }

    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static validatePhone(phone) {
        const re = /^[0-9]{9,12}$/;
        return re.test(phone.replace(/\D/g, ''));
    }

    static generateId() {
        return 'id-' + Math.random().toString(36).substr(2, 9);
    }

    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Hacer disponible globalmente
window.Helpers = Helpers;
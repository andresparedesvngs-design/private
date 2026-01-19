class DOMUtils {
    static getSafeValue(elementId, defaultValue = '') {
        try {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        } catch (error) {
            console.warn(`Error getting value for ${elementId}:`, error);
            return defaultValue;
        }
    }

    static setSafeValue(elementId, value) {
        try {
            const element = document.getElementById(elementId);
            if (element) element.value = value;
        } catch (error) {
            console.warn(`Error setting value for ${elementId}:`, error);
        }
    }

    static setSafeTextContent(elementId, value) {
        try {
            const element = document.getElementById(elementId);
            if (element) element.textContent = value;
        } catch (error) {
            console.warn(`Error setting text content for ${elementId}:`, error);
        }
    }

    static setSafeChecked(elementId, checked) {
        try {
            const element = document.getElementById(elementId);
            if (element) element.checked = checked;
        } catch (error) {
            console.warn(`Error setting checked for ${elementId}:`, error);
        }
    }

    static getSafeSelectValue(elementId, defaultValue = '') {
        try {
            const element = document.getElementById(elementId);
            return element ? element.value : defaultValue;
        } catch (error) {
            console.warn(`Error getting select value for ${elementId}:`, error);
            return defaultValue;
        }
    }

    static getSafeNumberValue(elementId, defaultValue = 0) {
        try {
            const element = document.getElementById(elementId);
            const value = element ? parseInt(element.value) : NaN;
            return isNaN(value) ? defaultValue : value;
        } catch (error) {
            console.warn(`Error getting number value for ${elementId}:`, error);
            return defaultValue;
        }
    }

    static getSafeCheckboxValue(elementId, defaultValue = false) {
        try {
            const element = document.getElementById(elementId);
            return element ? element.checked : defaultValue;
        } catch (error) {
            console.warn(`Error getting checkbox value for ${elementId}:`, error);
            return defaultValue;
        }
    }

    static getSelectedValues(elementId, defaultValues = []) {
        try {
            const element = document.getElementById(elementId);
            if (!element) return defaultValues;
            
            return Array.from(element.selectedOptions).map(opt => opt.value);
        } catch (error) {
            console.warn(`Error getting selected values for ${elementId}:`, error);
            return defaultValues;
        }
    }

    static createElement(tag, classes = '', innerHTML = '') {
        const element = document.createElement(tag);
        if (classes) element.className = classes;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    }

    static showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.style.display = 'block';
    }

    static hideElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.style.display = 'none';
    }

    static toggleElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = element.style.display === 'none' ? 'block' : 'none';
        }
    }

    static addEventDelegate(selector, event, handler, parent = document) {
        parent.addEventListener(event, function(e) {
            if (e.target.matches(selector)) {
                handler(e);
            }
        });
    }
}

window.DOMUtils = DOMUtils;